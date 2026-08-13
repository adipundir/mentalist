// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IncoTest } from "@inco/lightning/src/test/IncoTest.sol";
import { e, ebool, euint256, inco } from "@inco/lightning/src/Lib.sol";
import { DecryptionAttestation } from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Casebook } from "../contracts/Casebook.sol";
import { IJackpotRandomTicketBuyer } from "../contracts/CaseRewards.sol";
import { MockUSDC, MockJackpot } from "./CaseMarket.t.sol";

/**
 * @dev Casebook is the whole play loop in one contract, and the loop is deliberately quiet:
 *      the player opens a case, clicks through the alibis and works out who cannot possibly
 *      be telling the truth, and none of that touches a chain. The alibis live in
 *      `frontend/lib/casebook.ts`, in the open, and which person says which one is fixed and
 *      public. The first and only transaction of the game is the one where somebody decides
 *      to put money on a name.
 *
 *      So these tests are not about hiding the solution. A careful reader solves the puzzle
 *      from the repository without ever loading the page, and that is fine. Encryption is
 *      here for two other things, and both of them are money:
 *
 *        - settlement is trustless. The answer is fixed at `openCase` and the operator cannot
 *          reach in and change it once the bets are down, nor argue about it afterwards.
 *        - every bet is private. Nobody watching the chain can see which name the informed
 *          money is on, so nobody can copy it.
 *
 *      IncoTest mocks the whole Inco stack in process, so `get(handle)` is a plaintext oracle
 *      no production caller has. That is what lets these tests know who was named.
 */
contract CasebookTest is IncoTest {
    Casebook internal book;
    MockUSDC internal usdc;
    MockJackpot internal megapot;

    address internal jane = address(0x1A5E);
    address internal lisbon = address(0x115B0);
    address internal cho = address(0xC40);
    address internal stranger = address(0xBEEF);

    uint16 internal constant CASE_ID = 1;
    uint8 internal constant SUSPECTS = 5;
    uint64 internal constant OPEN_FOR = 2 hours;

    /// @dev Whoever gave the impossible alibi in this case. Public here because the test is
    ///      the author: on chain it only ever exists as a ciphertext.
    uint256 internal constant RED_JOHN = 3;
    uint256 internal constant SOMEONE_ELSE = 1;

    function setUp() public override {
        super.setUp();
        usdc = new MockUSDC();
        megapot = new MockJackpot(usdc);
        book = new Casebook(IJackpotRandomTicketBuyer(address(megapot)), address(this));

        // Inco fees come out of the *contract's* balance; msg.value only tops it up. Pre-funding
        // is the sponsored-fee model the deployed casebook uses, so a player never thinks about it.
        vm.deal(address(this), 1_000 ether);
        vm.deal(address(book), 100 ether);
        vm.deal(stranger, 10 ether);

        address[3] memory players = [jane, lisbon, cho];
        for (uint256 i; i < players.length; ++i) {
            vm.deal(players[i], 10 ether);
            usdc.mint(players[i], 1_000_000_000);
            vm.prank(players[i]);
            usdc.approve(address(book), type(uint256).max);
        }
    }

    // ── helpers ────────────────────────────────────────────────

    /// @dev The author encrypts the answer on their own machine and hands over a ciphertext.
    ///      This is the test-side stand-in for `zap.encrypt`.
    function _answerCipher(uint256 personId) internal view returns (bytes memory) {
        return fakePrepareEuint256Ciphertext(personId, address(this), address(book));
    }

    /// @dev And the player encrypts the name they are backing the same way.
    function _betCipher(address who, uint256 personId) internal view returns (bytes memory) {
        return fakePrepareEuint256Ciphertext(personId, who, address(book));
    }

    /**
     * @dev A prepared input is `uint32(version) || abi.encode(handle, ciphertext)`, and the
     *      handle it carries is exactly the handle Inco ingests it under. Pulling it out is
     *      the only way a test can talk about the stored answer at all, since the contract
     *      quite deliberately never exposes it.
     */
    function _handleOf(bytes memory input) internal pure returns (bytes32 handle) {
        assembly {
            handle := mload(add(input, 0x24))
        }
    }

    function _answerHandle(uint256 personId) internal view returns (bytes32) {
        return _handleOf(_answerCipher(personId));
    }

    function _open(uint16 caseId, uint256 personId, uint8 suspects, uint64 openFor) internal {
        bytes memory ct = _answerCipher(personId);
        uint256 fee = book.quoteFee();
        book.openCase{ value: fee }(caseId, suspects, ct, openFor);
        processAllOperations();
    }

    function _open(uint16 caseId, uint256 personId) internal {
        _open(caseId, personId, SUSPECTS, OPEN_FOR);
    }

    /// @dev The one transaction of the whole game.
    function _stake(address who, uint16 caseId, uint256 personId, uint256 amount) internal {
        // Both of these are external calls, so they are made before the prank rather than
        // inside the argument list, where either of them would spend it.
        bytes memory ct = _betCipher(who, personId);
        uint256 fee = book.quoteFee();
        vm.startPrank(who);
        book.stake{ value: fee }(caseId, ct, amount);
        vm.stopPrank();
        processAllOperations();
    }

    function _attest(
        address requester,
        bytes32 handle
    ) internal returns (DecryptionAttestation memory att, bytes[] memory sigs) {
        return
            getDecryptionAttestation(
                requester,
                HandleWithProof({ handle: handle, proof: _emptyAllowanceProof() })
            );
    }

    /// @dev `vm.expectRevert` only observes *external* calls, so asserting that a decryption is
    ///      refused has to cross a real call boundary.
    function attestOrRevert(address requester, bytes32 handle) external {
        _attest(requester, handle);
    }

    function _closesAt(uint16 caseId) internal view returns (uint64 closesAt) {
        (closesAt, , , , , , , ) = book.cases(caseId);
    }

    function _reachClose(uint16 caseId) internal {
        uint64 closesAt = _closesAt(caseId);
        if (block.timestamp < closesAt) vm.warp(closesAt);
    }

    /// @dev File the attestation over your own verdict bit. Model A: the contract rules.
    function _resolve(address who, uint16 caseId) internal {
        (DecryptionAttestation memory att, bytes[] memory sigs) = _attest(
            who,
            book.verdictHandle(caseId, who)
        );
        vm.prank(who);
        book.resolve(caseId, att, sigs);
    }

    function _settle(uint16 caseId) internal {
        uint64 closesAt = _closesAt(caseId);
        if (block.timestamp < closesAt + 1 hours) vm.warp(closesAt + 1 hours + 1);
        book.settle(caseId);
    }

    function _caseTotals(
        uint16 caseId
    ) internal view returns (uint128 pot, uint128 winningStake, uint32 entrants, uint32 winners) {
        (, , pot, winningStake, entrants, winners, , ) = book.cases(caseId);
    }

    function _bet(
        uint16 caseId,
        address who
    ) internal view returns (uint128 amount, bool resolved, bool won, bool paid) {
        return book.bets(caseId, who);
    }

    // ── opening a case ─────────────────────────────────────────

    /**
     * @notice A case is a closing time, a room size, and a ciphertext. Nothing else is written.
     *
     * @dev The plaintext oracle proves the answer really was ingested rather than dropped, and
     *      the fact that the test had to reconstruct the handle off the prepared input proves
     *      the contract publishes no route to it.
     */
    function test_OpeningACaseStoresAnEncryptedAnswer() public {
        uint256 startedAt = block.timestamp;
        _open(CASE_ID, RED_JOHN);

        (
            uint64 closesAt,
            uint8 suspects,
            uint128 pot,
            uint128 winningStake,
            uint32 entrants,
            uint32 winners,
            bool settled,
            bool exists
        ) = book.cases(CASE_ID);

        assertTrue(exists, "the case is on the books");
        assertEq(closesAt, startedAt + OPEN_FOR, "and it takes money until it does not");
        assertEq(suspects, SUSPECTS);
        assertEq(pot, 0);
        assertEq(winningStake, 0);
        assertEq(entrants, 0);
        assertEq(winners, 0);
        assertFalse(settled);

        assertEq(
            get(_answerHandle(RED_JOHN)),
            bytes32(RED_JOHN),
            "the answer was ingested, not dropped"
        );
        assertEq(book.timeLeft(CASE_ID), OPEN_FOR, "the clock is running");
    }

    /**
     * @notice An answer no seat has is folded back into the room instead of being stored.
     *
     * @dev The house edge this closes: the author seals a person id outside 0..suspects-1 and
     *      stakes the same id themselves. Every honest bet then compares false, the author is
     *      the only winner, and `shareOf` hands them the entire pot. Both sides are
     *      ciphertexts, so on chain it is indistinguishable from having simply guessed right,
     *      and nobody else can be refunded either, because the case did have a winner.
     */
    function test_AnAnswerNoSeatHasIsFoldedBackIntoTheRoom() public {
        _open(CASE_ID, 999);

        _stake(jane, CASE_ID, 999, 1_000_000); // the rigged name
        _stake(lisbon, CASE_ID, 999 % SUSPECTS, 1_000_000); // a seat that exists

        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _resolve(lisbon, CASE_ID);

        (, , bool riggedWon, ) = _bet(CASE_ID, jane);
        (, , bool honestWon, ) = _bet(CASE_ID, lisbon);
        assertFalse(riggedWon, "an id nobody sits at cannot be the winning one");
        assertTrue(honestWon, "it landed on a real seat, and that seat is winnable");
    }

    function test_OnlyTheOwnerCanOpenACase() public {
        bytes memory ct = fakePrepareEuint256Ciphertext(RED_JOHN, stranger, address(book));
        uint256 fee = book.quoteFee();

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        book.openCase{ value: fee }(CASE_ID, SUSPECTS, ct, OPEN_FOR);
    }

    function test_CannotOpenTheSameCaseTwice() public {
        _open(CASE_ID, RED_JOHN);

        bytes memory ct = _answerCipher(SOMEONE_ELSE);
        uint256 fee = book.quoteFee();
        vm.expectRevert(Casebook.CaseExists.selector);
        book.openCase{ value: fee }(CASE_ID, SUSPECTS, ct, OPEN_FOR);
    }

    function test_RejectsAnUnplayableCase() public {
        bytes memory ct = _answerCipher(RED_JOHN);
        uint256 fee = book.quoteFee();

        // One person in the room is not a question, and a window that closes inside the hour
        // is not a market.
        vm.expectRevert(Casebook.BadConfig.selector);
        book.openCase{ value: fee }(CASE_ID, 1, ct, OPEN_FOR);

        vm.expectRevert(Casebook.BadConfig.selector);
        book.openCase{ value: fee }(CASE_ID, SUSPECTS, ct, 59 minutes);
    }

    function test_OpeningPaysTheIngestFee() public {
        bytes memory ct = _answerCipher(RED_JOHN);
        vm.expectRevert(Casebook.FeeTooLow.selector);
        book.openCase{ value: 0 }(CASE_ID, SUSPECTS, ct, OPEN_FOR);

        assertGt(book.quoteFee(), 0, "and the quote is not free either");
    }

    // ── the one transaction ────────────────────────────────────

    /**
     * @notice Nothing happened on chain until this. The player read the alibis off a static
     *         file, made up their mind, and only then signed anything.
     */
    function test_StakingIsTheFirstAndOnlyContractCall() public {
        _open(CASE_ID, RED_JOHN);
        assertFalse(book.hasStaked(CASE_ID, jane), "she has read the whole case and touched nothing");

        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);

        (uint128 pot, , uint32 entrants, ) = _caseTotals(CASE_ID);
        assertEq(pot, 1_000_000, "the pot took the stake");
        assertEq(entrants, 1);
        assertTrue(book.hasStaked(CASE_ID, jane));
        assertEq(usdc.balanceOf(address(book)), 1_000_000, "the contract custodies it");
        assertEq(book.reserved(), 1_000_000, "and it is reserved, not surplus");

        (uint128 amount, bool resolved, bool won, bool paid) = _bet(CASE_ID, jane);
        assertEq(amount, 1_000_000);
        assertFalse(resolved);
        assertFalse(won);
        assertFalse(paid);
        assertTrue(book.verdictHandle(CASE_ID, jane) != bytes32(0), "a verdict bit exists already");
    }

    function test_NamingTheRightPersonWins() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);

        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);

        (, bool resolved, bool won, ) = _bet(CASE_ID, jane);
        assertTrue(resolved);
        assertTrue(won, "she named the man who could not have been telling the truth");

        (uint128 pot, uint128 winningStake, , uint32 winners) = _caseTotals(CASE_ID);
        assertEq(pot, 1_000_000);
        assertEq(winningStake, 1_000_000);
        assertEq(winners, 1);
    }

    function test_NamingAnyoneElseDoesNot() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, SOMEONE_ELSE, 1_000_000);

        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);

        (, bool resolved, bool won, ) = _bet(CASE_ID, jane);
        assertTrue(resolved);
        assertFalse(won, "wrong name");

        (, uint128 winningStake, , uint32 winners) = _caseTotals(CASE_ID);
        assertEq(winningStake, 0);
        assertEq(winners, 0);
    }

    // ── what is actually secret ────────────────────────────────

    /**
     * @notice The answer is unreadable off chain by anybody who did not write it.
     *
     * @dev This is the trustless-settlement half of the claim, not a claim about the puzzle.
     *      The answer is fixed at `openCase` and no account other than its author can pull it
     *      back out, which is what stops the operator from rewriting or disputing the result
     *      once money is down. The author can still read it, of course: they typed it.
     */
    function test_TheAnswerIsUnreadableByAnyoneWhoDidNotWriteIt() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        bytes32 answer = _answerHandle(RED_JOHN);

        vm.expectRevert();
        this.attestOrRevert(stranger, answer);

        // Not even by someone with money on the case, and not after it closes either.
        vm.expectRevert();
        this.attestOrRevert(jane, answer);

        _reachClose(CASE_ID);
        _settle(CASE_ID);
        vm.expectRevert();
        this.attestOrRevert(jane, answer);

        // Only the author, who is the one account that knew it before the chain did.
        this.attestOrRevert(address(this), answer);
    }

    /**
     * @notice And each player's own bet is readable by that player alone.
     *
     * @dev The privacy half. If verdict bits were public a spectator could watch which wallets
     *      came out right and simply follow the informed money next time; if they were
     *      readable by anyone at all, they could follow it *while the case was still open*.
     */
    function test_OnlyThePlayerCanReadTheirOwnVerdict() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        _stake(lisbon, CASE_ID, SOMEONE_ELSE, 1_000_000);

        bytes32 hers = book.verdictHandle(CASE_ID, jane);
        bytes32 his = book.verdictHandle(CASE_ID, lisbon);
        assertTrue(hers != his, "two players, two verdicts");

        this.attestOrRevert(jane, hers);
        this.attestOrRevert(lisbon, his);

        // The other player is just another spectator here.
        vm.expectRevert();
        this.attestOrRevert(lisbon, hers);
        vm.expectRevert();
        this.attestOrRevert(stranger, hers);
        vm.expectRevert();
        this.attestOrRevert(jane, his);
    }

    // ── the rules of the bet ───────────────────────────────────

    /// @notice One wallet, one read of the room.
    function test_OneStakePerWalletPerCase() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);

        bytes memory ct = _betCipher(jane, SOMEONE_ELSE);
        uint256 fee = book.quoteFee();
        vm.prank(jane);
        vm.expectRevert(Casebook.AlreadyStaked.selector);
        book.stake{ value: fee }(CASE_ID, ct, 1_000_000);
    }

    function test_StakeMustSitInsideTheRange() public {
        _open(CASE_ID, RED_JOHN);

        // Read the bounds and build the ciphertext before pranking: an external call inside an
        // argument list spends the pending prank and the revert then comes from the wrong sender.
        uint256 lo = book.minStake();
        uint256 hi = book.maxStake();
        bytes memory low = _betCipher(jane, RED_JOHN);
        bytes memory high = _betCipher(lisbon, RED_JOHN);
        uint256 fee = book.quoteFee();

        vm.prank(jane);
        vm.expectRevert(abi.encodeWithSelector(Casebook.StakeOutOfRange.selector, lo, hi));
        book.stake{ value: fee }(CASE_ID, low, lo - 1);

        vm.prank(lisbon);
        vm.expectRevert(abi.encodeWithSelector(Casebook.StakeOutOfRange.selector, lo, hi));
        book.stake{ value: fee }(CASE_ID, high, hi + 1);
    }

    function test_OwnerCanMoveTheStakeRange() public {
        book.setStakeRange(1_000_000, 2_000_000);
        assertEq(book.minStake(), 1_000_000);
        assertEq(book.maxStake(), 2_000_000);

        vm.expectRevert(Casebook.BadConfig.selector);
        book.setStakeRange(0, 2_000_000);
        vm.expectRevert(Casebook.BadConfig.selector);
        book.setStakeRange(2_000_000, 1_000_000);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        book.setStakeRange(1, 2);
    }

    /// @dev The deadline is the whole reason the bet is a bet.
    function test_CannotStakeOnceTheCaseHasClosed() public {
        _open(CASE_ID, RED_JOHN);
        _reachClose(CASE_ID);

        bytes memory ct = _betCipher(jane, RED_JOHN);
        uint256 fee = book.quoteFee();
        vm.prank(jane);
        vm.expectRevert(Casebook.CaseClosed.selector);
        book.stake{ value: fee }(CASE_ID, ct, 1_000_000);

        assertEq(book.timeLeft(CASE_ID), 0, "and the clock says so");
    }

    function test_CannotStakeOnACaseThatWasNeverOpened() public {
        bytes memory ct = _betCipher(jane, RED_JOHN);
        uint256 fee = book.quoteFee();
        vm.prank(jane);
        vm.expectRevert(Casebook.NoSuchCase.selector);
        book.stake{ value: fee }(CASE_ID, ct, 1_000_000);
    }

    function test_StakingPaysTheIngestFee() public {
        _open(CASE_ID, RED_JOHN);
        bytes memory ct = _betCipher(jane, RED_JOHN);
        vm.prank(jane);
        vm.expectRevert(Casebook.FeeTooLow.selector);
        book.stake{ value: 0 }(CASE_ID, ct, 1_000_000);
    }

    // ── filing the result ──────────────────────────────────────

    /**
     * @dev Not while money is still moving. A player who could decrypt their own verdict early
     *      could work out the answer from it and tell the entire lobby.
     */
    function test_CannotResolveBeforeTheCaseCloses() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);

        (DecryptionAttestation memory att, bytes[] memory sigs) = _attest(
            jane,
            book.verdictHandle(CASE_ID, jane)
        );
        vm.prank(jane);
        vm.expectRevert(Casebook.CaseStillOpen.selector);
        book.resolve(CASE_ID, att, sigs);
    }

    function test_CannotResolveTwice() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        _reachClose(CASE_ID);

        (DecryptionAttestation memory att, bytes[] memory sigs) = _attest(
            jane,
            book.verdictHandle(CASE_ID, jane)
        );
        vm.startPrank(jane);
        book.resolve(CASE_ID, att, sigs);
        vm.expectRevert(Casebook.AlreadyResolved.selector);
        book.resolve(CASE_ID, att, sigs);
        vm.stopPrank();

        (, uint128 winningStake, , uint32 winners) = _caseTotals(CASE_ID);
        assertEq(winningStake, 1_000_000, "and the win was not counted twice");
        assertEq(winners, 1);
    }

    /**
     * @notice You may only file over your own verdict bit.
     *
     * @dev The attestation is a valid, correctly signed decryption. It is just not a decryption
     *      of the handle this contract stored for the caller, and taking it would let a loser
     *      settle on somebody else's win.
     */
    function test_ResolvingWithSomeoneElsesVerdictIsRejected() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, SOMEONE_ELSE, 1_000_000);
        _stake(lisbon, CASE_ID, RED_JOHN, 1_000_000);
        _reachClose(CASE_ID);

        (DecryptionAttestation memory his, bytes[] memory sigs) = _attest(
            lisbon,
            book.verdictHandle(CASE_ID, lisbon)
        );
        vm.prank(jane);
        vm.expectRevert(Casebook.HandleMismatch.selector);
        book.resolve(CASE_ID, his, sigs);
    }

    /// @dev And you may not simply assert the bit. The signature is over handle *and* value.
    function test_CannotForgeAWinningVerdict() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, SOMEONE_ELSE, 1_000_000);
        _reachClose(CASE_ID);

        (DecryptionAttestation memory att, bytes[] memory sigs) = _attest(
            jane,
            book.verdictHandle(CASE_ID, jane)
        );
        assertEq(att.value, bytes32(0), "she was wrong");

        DecryptionAttestation memory forged = DecryptionAttestation({
            handle: att.handle,
            value: bytes32(uint256(1))
        });
        vm.prank(jane);
        vm.expectRevert(Casebook.InvalidAttestation.selector);
        book.resolve(CASE_ID, forged, sigs);
    }

    function test_CannotResolveWithoutHavingStaked() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        _reachClose(CASE_ID);

        (DecryptionAttestation memory att, bytes[] memory sigs) = _attest(
            jane,
            book.verdictHandle(CASE_ID, jane)
        );
        vm.prank(stranger);
        vm.expectRevert(Casebook.NothingStaked.selector);
        book.resolve(CASE_ID, att, sigs);
    }

    function test_CannotResolveOnceTheBooksAreClosed() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        _stake(lisbon, CASE_ID, RED_JOHN, 1_000_000);
        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _settle(CASE_ID);

        (DecryptionAttestation memory att, bytes[] memory sigs) = _attest(
            lisbon,
            book.verdictHandle(CASE_ID, lisbon)
        );
        vm.prank(lisbon);
        vm.expectRevert(Casebook.AlreadySettled.selector);
        book.resolve(CASE_ID, att, sigs);

        // Shares are computed against `winningStake`, so a late filer would shrink everyone
        // else's share after the first of them had already been paid on the old denominator.
        assertEq(book.shareOf(CASE_ID, jane), 2_000_000, "the pot was not re-cut behind her");
    }

    /// @dev A grace window after the close, so a slow filer is not cut out of their own win.
    function test_CannotSettleEarlyAndCannotSettleTwice() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);

        vm.expectRevert(Casebook.CaseStillOpen.selector);
        book.settle(CASE_ID);

        _reachClose(CASE_ID);
        vm.expectRevert(Casebook.CaseStillOpen.selector);
        book.settle(CASE_ID);

        _resolve(jane, CASE_ID);
        _settle(CASE_ID);
        vm.expectRevert(Casebook.AlreadySettled.selector);
        book.settle(CASE_ID);
    }

    function test_CannotSettleACaseThatDoesNotExist() public {
        vm.expectRevert(Casebook.NoSuchCase.selector);
        book.settle(CASE_ID);
    }

    // ── the pot ────────────────────────────────────────────────

    /**
     * @notice Shares are pro rata to stake, and the whole pot goes out. The losers' money is
     *         exactly what makes a correct read worth more than it cost.
     */
    function test_SharesAreProRataAndTheWholePotIsDistributed() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 4_000_000);
        _stake(lisbon, CASE_ID, RED_JOHN, 1_000_000);
        _stake(cho, CASE_ID, SOMEONE_ELSE, 2_000_000);

        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _resolve(lisbon, CASE_ID);
        _resolve(cho, CASE_ID);
        _settle(CASE_ID);

        (uint128 pot, uint128 winningStake, uint32 entrants, uint32 winners) = _caseTotals(CASE_ID);
        assertEq(pot, 7_000_000);
        assertEq(winningStake, 5_000_000, "only the two who named him");
        assertEq(entrants, 3);
        assertEq(winners, 2);

        uint256 hers = book.shareOf(CASE_ID, jane);
        uint256 his = book.shareOf(CASE_ID, lisbon);
        assertEq(hers, (7_000_000 * 4) / 5, "four fifths of the winning stake, four fifths of everything");
        assertEq(his, (7_000_000 * 1) / 5);
        assertEq(book.shareOf(CASE_ID, cho), 0, "wrong name, nothing");
        assertEq(hers + his, pot, "and the pot is handed out down to the last unit");

        assertGt(hers, 4_000_000, "both winners beat their own stake");
        assertGt(his, 1_000_000);
    }

    /**
     * @notice A pot that does not divide evenly is still handed out to the last unit.
     *
     * @dev Flooring each winner's share independently would leave a few micro-USDC behind, and
     *      those are the worst kind of stranded: still counted in `reserved`, so the contract
     *      goes on calling them owed and `withdrawSurplus` can never reach them either. It is
     *      pennies per case and it never stops accumulating.
     */
    function test_AnUnevenSplitStillLeavesNothingBehind() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        _stake(lisbon, CASE_ID, RED_JOHN, 2_000_000);
        _stake(cho, CASE_ID, SOMEONE_ELSE, 100_000); // 3.1 to divide three ways

        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _resolve(lisbon, CASE_ID);
        _resolve(cho, CASE_ID);
        _settle(CASE_ID);

        (uint128 pot, , , ) = _caseTotals(CASE_ID);
        uint256 hers = book.shareOf(CASE_ID, jane);
        uint256 his = book.shareOf(CASE_ID, lisbon);
        assertEq(hers + his, pot, "every unit of the pot belongs to one of them");

        vm.prank(jane);
        book.payout(CASE_ID);
        vm.prank(lisbon);
        book.payout(CASE_ID);

        assertEq(book.reserved(), 0, "and the books agree once they have both collected");
        assertEq(usdc.balanceOf(address(book)), 0, "with nothing stranded here");
    }

    /// @notice Winnings leave as real Megapot entries, and whatever a whole ticket will not
    ///         buy comes back rather than staying with the house.
    function test_PayoutBuysMegapotTicketsAndReturnsTheDust() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 4_000_000);
        _stake(lisbon, CASE_ID, RED_JOHN, 1_000_000);
        _stake(cho, CASE_ID, SOMEONE_ELSE, 2_000_000);

        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _resolve(lisbon, CASE_ID);
        _resolve(cho, CASE_ID);
        _settle(CASE_ID);

        uint256 hers = book.shareOf(CASE_ID, jane); // 5.6 USDC
        uint256 before = usdc.balanceOf(jane);

        vm.prank(jane);
        uint256[] memory ids = book.payout(CASE_ID);

        assertEq(ids.length, 5, "five whole tickets");
        for (uint256 i; i < ids.length; ++i) assertGt(ids[i], 0, "every id came back filled in");
        assertEq(megapot.ticketsOf(jane), 5, "and Megapot issued them to her, not to us");
        assertEq(usdc.balanceOf(jane) - before, hers - 5_000_000, "the sub-ticket remainder came back");

        (, , , bool paid) = _bet(CASE_ID, jane);
        assertTrue(paid);

        vm.prank(lisbon);
        book.payout(CASE_ID);
        assertEq(megapot.ticketsOf(lisbon), 1, "one ticket on 1.4 USDC");
        assertEq(usdc.balanceOf(address(megapot)), 6_000_000, "the losing stake went to Megapot too");
    }

    /// @dev Megapot's quick-pick buyer refuses more than ten at a time, so a big share batches.
    function test_ALargeShareBuysTicketsInBatches() public {
        book.setStakeRange(100_000, 30_000_000);
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 25_000_000);

        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _settle(CASE_ID);

        vm.prank(jane);
        uint256[] memory ids = book.payout(CASE_ID);
        assertEq(ids.length, 25, "twenty-five tickets across three calls");
        assertEq(megapot.ticketsOf(jane), 25);
        for (uint256 i; i < ids.length; ++i) assertGt(ids[i], 0, "no hole in the middle of the batch");
    }

    function test_LosersCannotBePaid() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        _stake(lisbon, CASE_ID, SOMEONE_ELSE, 1_000_000);

        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _resolve(lisbon, CASE_ID);
        _settle(CASE_ID);

        vm.prank(lisbon);
        vm.expectRevert(Casebook.DidNotWin.selector);
        book.payout(CASE_ID);
    }

    function test_CannotBePaidTwice() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _settle(CASE_ID);

        vm.startPrank(jane);
        book.payout(CASE_ID);
        vm.expectRevert(Casebook.AlreadyPaid.selector);
        book.payout(CASE_ID);
        vm.stopPrank();
    }

    function test_CannotBePaidBeforeSettlementOrWithoutFiling() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        _stake(lisbon, CASE_ID, RED_JOHN, 1_000_000);

        vm.prank(jane);
        vm.expectRevert(Casebook.NotSettled.selector);
        book.payout(CASE_ID);

        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _settle(CASE_ID);

        // Lisbon named the right man and never filed. The contract has no verdict from him.
        vm.prank(lisbon);
        vm.expectRevert(Casebook.NotResolved.selector);
        book.payout(CASE_ID);

        vm.prank(stranger);
        vm.expectRevert(Casebook.NothingStaked.selector);
        book.payout(CASE_ID);
    }

    /// @dev Megapot's ticket sales are a toggle somebody else owns, and it goes down for
    ///      drawing windows and LP locks. A winner's money must not be hostage to it: there is
    ///      no other way out of this contract for a winning bet, since `refund` is closed to a
    ///      case that had a winner and `withdrawSurplus` cannot touch reserved money. So the
    ///      share leaves as USDC and the tickets are simply what it could not buy.
    function test_MegapotBeingShutPaysTheShareOutInUsdcInstead() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _settle(CASE_ID);

        megapot.setOpen(false);

        uint256 before = usdc.balanceOf(jane);
        vm.prank(jane);
        uint256[] memory ids = book.payout(CASE_ID);

        assertEq(ids.length, 0, "no tickets while Megapot is shut");
        assertEq(usdc.balanceOf(jane) - before, 1_000_000, "the whole share came back as USDC");
        assertEq(book.reserved(), 0, "and nothing of hers is still held here");
    }

    /// @dev Same trap by another route: `share / price` panics on a zero price, which would
    ///      freeze every payout just as thoroughly.
    function test_AZeroTicketPriceDoesNotFreezeThePayout() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _settle(CASE_ID);

        megapot.setTicketPrice(0);

        uint256 before = usdc.balanceOf(jane);
        vm.prank(jane);
        uint256[] memory ids = book.payout(CASE_ID);

        assertEq(ids.length, 0, "no tickets at a price of nothing");
        assertEq(usdc.balanceOf(jane) - before, 1_000_000, "the whole share came back as USDC");
    }

    // ── nobody got it ──────────────────────────────────────────

    /// @dev A pot with no winners has nobody to divide it among, and keeping it would make the
    ///      house the beneficiary of everybody's failure.
    function test_NobodyNamedHimSoEverybodyIsRefunded() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, SOMEONE_ELSE, 1_000_000);
        _stake(lisbon, CASE_ID, 0, 2_000_000);

        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _resolve(lisbon, CASE_ID);
        _settle(CASE_ID);

        uint256 herBefore = usdc.balanceOf(jane);
        uint256 hisBefore = usdc.balanceOf(lisbon);

        vm.prank(jane);
        book.refund(CASE_ID);
        vm.prank(lisbon);
        book.refund(CASE_ID);

        assertEq(usdc.balanceOf(jane) - herBefore, 1_000_000, "exactly what she put in");
        assertEq(usdc.balanceOf(lisbon) - hisBefore, 2_000_000);
        assertEq(book.reserved(), 0, "nothing left owed");
        assertEq(usdc.balanceOf(address(book)), 0, "and the house kept none of it");
        assertEq(megapot.ticketsOf(jane), 0, "no tickets were bought on a dead case");
    }

    function test_NobodyIsRefundedWhileSomebodyCanStillBePaid() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        _stake(lisbon, CASE_ID, SOMEONE_ELSE, 1_000_000);

        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _resolve(lisbon, CASE_ID);
        _settle(CASE_ID);

        // The loser cannot take his stake back out of the winner's pot.
        vm.prank(lisbon);
        vm.expectRevert(Casebook.DidNotWin.selector);
        book.refund(CASE_ID);

        // Nor can the winner take the refund path instead of the payout one.
        vm.prank(jane);
        vm.expectRevert(Casebook.DidNotWin.selector);
        book.refund(CASE_ID);
    }

    function test_CannotRefundBeforeSettlement() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, SOMEONE_ELSE, 1_000_000);

        vm.prank(jane);
        vm.expectRevert(Casebook.NotSettled.selector);
        book.refund(CASE_ID);
    }

    function test_CannotRefundTwice() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, SOMEONE_ELSE, 1_000_000);
        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _settle(CASE_ID);

        vm.startPrank(jane);
        book.refund(CASE_ID);
        vm.expectRevert(Casebook.AlreadyPaid.selector);
        book.refund(CASE_ID);
        vm.stopPrank();
    }

    // ── solvency ───────────────────────────────────────────────

    /**
     * @notice The invariant that matters: once the winners are paid, the contract owes nothing
     *         and holds nothing.
     */
    function test_ReservedDrainsToZeroOnceWinnersArePaid() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 4_000_000);
        _stake(lisbon, CASE_ID, RED_JOHN, 1_000_000);
        _stake(cho, CASE_ID, SOMEONE_ELSE, 2_000_000);
        assertEq(book.reserved(), 7_000_000);

        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _resolve(lisbon, CASE_ID);
        _resolve(cho, CASE_ID);
        _settle(CASE_ID);

        vm.prank(jane);
        book.payout(CASE_ID);
        vm.prank(lisbon);
        book.payout(CASE_ID);

        assertEq(book.reserved(), 0, "nothing left owed on this case");
        assertEq(usdc.balanceOf(address(book)), 0, "and no stranded USDC");
    }

    /**
     * @notice The Inco fee float has a way out.
     *
     * @dev Inco draws its fee from this contract's balance rather than from `msg.value`, and
     *      `quoteFee` deliberately quotes headroom against a fee bump, so ETH accretes here
     *      with every case opened and every bet placed. `withdrawSurplus` moves USDC only, so
     *      without this the float would sit here forever with nobody able to reach it.
     */
    function test_TheIncoFeeFloatCanBeSweptOut() public {
        _open(CASE_ID, RED_JOHN);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);

        uint256 float = address(book).balance;
        assertGt(float, 0, "the fees left something behind");

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        book.withdrawEth(stranger);

        uint256 before = stranger.balance;
        book.withdrawEth(stranger);

        assertEq(address(book).balance, 0, "the float is out");
        assertEq(stranger.balance - before, float);
        assertEq(usdc.balanceOf(address(book)), 1_000_000, "and nobody's stake moved");
        assertEq(book.reserved(), 1_000_000);
    }

    /**
     * @notice `withdrawSurplus` can only ever reach referral fees and rounding dust.
     *
     * @dev Two open cases, so the test also covers the failure where one case's stakes look
     *      like another's spare change.
     */
    function test_WithdrawSurplusCannotTouchStakes() public {
        _open(CASE_ID, RED_JOHN);
        _open(CASE_ID + 1, SOMEONE_ELSE);
        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        _stake(lisbon, CASE_ID + 1, SOMEONE_ELSE, 2_000_000);

        assertEq(book.reserved(), 3_000_000);
        assertEq(usdc.balanceOf(address(book)), 3_000_000);

        vm.expectRevert(Casebook.BadConfig.selector);
        book.withdrawSurplus(address(this));

        // Megapot pays a referral fee in. *That* is withdrawable, and only that.
        usdc.mint(address(book), 500_000);
        book.withdrawSurplus(address(this));

        assertEq(usdc.balanceOf(address(this)), 500_000, "the fee, and not a unit more");
        assertEq(usdc.balanceOf(address(book)), 3_000_000, "both cases' stakes are untouched");
        assertEq(book.reserved(), 3_000_000);

        vm.expectRevert(Casebook.BadConfig.selector);
        book.withdrawSurplus(address(this));

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        book.withdrawSurplus(stranger);
    }

    /**
     * @dev Two cases run side by side without leaking into each other's books.
     *
     *      Note the person ids: Inco refuses a ciphertext it has already ingested for the same
     *      author and contract, so no account can encrypt the same name twice. Both cases here
     *      therefore hide a different person, and Jane backs a different name in each.
     */
    function test_CasesAreIndependent() public {
        _open(CASE_ID, RED_JOHN);
        _open(CASE_ID + 1, 2);

        _stake(jane, CASE_ID, RED_JOHN, 1_000_000);
        _stake(jane, CASE_ID + 1, 0, 2_000_000); // right in one room, wrong in the other

        _reachClose(CASE_ID);
        _resolve(jane, CASE_ID);
        _resolve(jane, CASE_ID + 1);

        (, bool firstResolved, bool wonFirst, ) = _bet(CASE_ID, jane);
        (, bool secondResolved, bool wonSecond, ) = _bet(CASE_ID + 1, jane);
        assertTrue(firstResolved && secondResolved);
        assertTrue(wonFirst, "she named the right man in the first case");
        assertFalse(wonSecond, "and the wrong one in the second");

        (uint128 firstPot, , , ) = _caseTotals(CASE_ID);
        (uint128 secondPot, , , ) = _caseTotals(CASE_ID + 1);
        assertEq(firstPot, 1_000_000);
        assertEq(secondPot, 2_000_000);
    }
}
