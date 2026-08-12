// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IncoTest } from "@inco/lightning/src/test/IncoTest.sol";
import { e, ebool } from "@inco/lightning/src/Lib.sol";
import { DecryptionAttestation } from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Mentalist } from "../contracts/Mentalist.sol";
import { CaseMarket } from "../contracts/CaseMarket.sol";
import { IJackpot, IJackpotRandomTicketBuyer } from "../contracts/CaseRewards.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Stands in for Megapot. Records what was bought and for whom so the tests can assert
///      that winnings actually leave as tickets rather than as a number in a mapping.
contract MockJackpot is IJackpot, IJackpotRandomTicketBuyer {
    MockUSDC public token;
    uint256 public price = 1_000_000; // 1 USDC
    bool public open = true;
    uint256 internal _nextId = 1;

    mapping(address => uint256) public ticketsOf;
    mapping(address => uint256) public referralFees;

    constructor(MockUSDC _token) {
        token = _token;
    }

    function setOpen(bool v) external {
        open = v;
    }

    function ticketPrice() external view returns (uint256) {
        return price;
    }

    function currentDrawingId() external pure returns (uint256) {
        return 1;
    }

    function allowTicketPurchases() external view returns (bool) {
        return open;
    }

    function claimReferralFees() external {}

    function jackpot() external view returns (address) {
        return address(this);
    }

    function usdc() external view returns (address) {
        return address(token);
    }

    function buyTickets(
        uint256 _count,
        address _recipient,
        address[] calldata,
        uint256[] calldata,
        bytes32
    ) external returns (uint256[] memory ids) {
        require(_count >= 1 && _count <= 10, "MockJackpot: count out of range");
        token.transferFrom(msg.sender, address(this), price * _count);
        ids = new uint256[](_count);
        for (uint256 i; i < _count; ++i) ids[i] = _nextId++;
        ticketsOf[_recipient] += _count;
    }
}

/**
 * @dev The market is where the game stops being a puzzle and starts being a wager, so these
 *      tests are about money and time rather than about secrets: one entry per wallet, a clock
 *      you can miss, a pot divided by conviction, and no path that leaves USDC stranded.
 */
contract CaseMarketTest is IncoTest {
    Mentalist internal game;
    MockUSDC internal usdc;
    MockJackpot internal megapot;
    CaseMarket internal market;

    address internal jane = address(0x1A5E);
    address internal lisbon = address(0x115B0);
    address internal cho = address(0xC40);

    uint8 internal constant CASE_IX = 0;
    uint8 internal constant N = 4;
    uint8 internal constant LIARS = 1;
    /// @dev One question per suspect, which is what every deployed round is configured with.
    uint8 internal constant FOCUS = N;
    uint8 internal constant TURN_AT = 0;

    function setUp() public override {
        super.setUp();
        game = new Mentalist();
        usdc = new MockUSDC();
        megapot = new MockJackpot(usdc);
        market = new CaseMarket(game, IJackpotRandomTicketBuyer(address(megapot)), address(this));

        vm.deal(address(game), 100 ether);
        market.configureRound(CASE_IX, N, LIARS, FOCUS, TURN_AT);

        address[3] memory players = [jane, lisbon, cho];
        for (uint256 i; i < players.length; ++i) {
            vm.deal(players[i], 10 ether);
            usdc.mint(players[i], 1_000_000_000);
            vm.prank(players[i]);
            usdc.approve(address(market), type(uint256).max);
        }
    }

    // ── helpers ────────────────────────────────────────────────

    function _openCase(address who) internal returns (uint256 id) {
        uint256 fee = game.quoteOpenFee(N);
        vm.prank(who);
        id = game.openCase{ value: fee }(N, LIARS, FOCUS, TURN_AT);
        processAllOperations();
    }

    /// @dev The full entry: take a seat blind, hear the whole room, then back your read.
    function _enter(address who, uint256 amount) internal returns (uint256 id) {
        id = _openCase(who);
        vm.prank(who);
        market.claimSeat(CASE_IX, id);
        _hearEveryone(who, id);
        vm.prank(who);
        market.stake(CASE_IX, amount);
    }

    function _hearEveryone(address who, uint256 id) internal {
        vm.prank(who);
        game.beginHearing(id);
        processAllOperations();
    }

    function _killerOf(uint256 id) internal returns (uint8 killer) {
        for (uint8 i = 0; i < N; i++) {
            if (get(ebool.unwrap(game.guiltOf(id, i))) != bytes32(0)) return i;
        }
        revert("no killer");
    }

    /// @dev Play the case out to a verdict. `correct` picks the real killer or anyone else.
    function _play(address who, uint256 id, bool correct) internal {
        uint8 killer = _killerOf(id);
        uint8 seat = correct ? killer : (killer + 1) % N;

        vm.prank(who);
        game.accuse(id, seat);
        processAllOperations();

        (DecryptionAttestation memory att, bytes[] memory sigs) = getDecryptionAttestation(
            who,
            HandleWithProof({ handle: game.verdictHandle(id), proof: _emptyAllowanceProof() })
        );
        vm.prank(who);
        game.settle(id, att, sigs);
    }

    function _sealAfterWindow() internal {
        (uint64 closesAt, , , , , ) = market.rounds(CASE_IX);
        vm.warp(closesAt + market.playWindow() + 1);
        market.sealRound(CASE_IX);
    }

    // ── entry ──────────────────────────────────────────────────

    function test_EnterStakesIntoThePotAndStartsTheClock() public {
        uint256 id = _enter(jane, 1_000_000);

        (, uint128 pot, , uint32 entrants, , ) = market.rounds(CASE_IX);
        assertEq(pot, 1_000_000, "pot took the stake");
        assertEq(entrants, 1, "one entrant");
        assertEq(usdc.balanceOf(address(market)), 1_000_000, "market custodies the stake");
        assertEq(market.reserved(), 1_000_000, "stake is reserved, not surplus");
        assertEq(market.timeLeft(CASE_IX, jane), market.playWindow(), "clock started");
        assertTrue(market.hasPlayed(CASE_IX, jane), "recorded as played");

        (uint128 stake, uint256 caseId, , , , ) = market.entries(CASE_IX, jane);
        assertEq(stake, 1_000_000);
        assertEq(caseId, id, "bound to the case she opened");
    }

    /// @notice One wallet, one read of the room. The user asked for exactly this.
    function test_OneEntryPerWalletPerCase() public {
        _enter(jane, 1_000_000);

        uint256 second = _openCase(jane);
        vm.prank(jane);
        vm.expectRevert(CaseMarket.AlreadyEntered.selector);
        market.claimSeat(CASE_IX, second);
    }

    function test_CannotEnterWithSomeoneElsesCase() public {
        uint256 id = _openCase(jane);
        vm.prank(lisbon);
        vm.expectRevert(CaseMarket.NotYourCase.selector);
        market.claimSeat(CASE_IX, id);
    }

    /**
     * @dev The seat has to be taken blind.
     *
     *      Once the room has been opened the player has every account in front of them, so
     *      allowing a seat to be claimed afterwards would let someone read a room, dislike
     *      what it says, and go shopping for an easier one to put money on.
     */
    function test_CannotTakeASeatAfterReadingTheRoom() public {
        uint256 id = _openCase(jane);
        vm.prank(jane);
        game.beginHearing(id);
        processAllOperations();

        vm.prank(jane);
        vm.expectRevert(CaseMarket.CaseAlreadyPlayed.selector);
        market.claimSeat(CASE_IX, id);
    }

    /// @dev And you cannot bring an easier lineup to a harder round.
    function test_CannotEnterWithTheWrongLineup() public {
        uint256 fee = game.quoteOpenFee(6);
        vm.prank(jane);
        uint256 easy = game.openCase{ value: fee }(6, 2, FOCUS, TURN_AT);
        processAllOperations();

        vm.prank(jane);
        vm.expectRevert(CaseMarket.WrongCase.selector);
        market.claimSeat(CASE_IX, easy);
    }

    function test_StakeMustSitInsideTheRange() public {
        uint256 id = _openCase(jane);
        vm.prank(jane);
        market.claimSeat(CASE_IX, id);
        _hearEveryone(jane, id);

        // Read the bounds before pranking: an external call inside expectRevert's argument
        // spends the prank, and the revert then comes from the wrong sender.
        uint256 lo = market.minStake();
        uint256 hi = market.maxStake();
        vm.prank(jane);
        vm.expectRevert(abi.encodeWithSelector(CaseMarket.StakeOutOfRange.selector, lo, hi));
        market.stake(CASE_IX, 1);
    }

    /**
     * @notice The reroll this design exists to prevent.
     *
     * @dev If the case could be chosen after listening, a player would open a room, hear it
     *      out, and abandon any deal that stayed ambiguous until one resolved cleanly. Every
     *      stake would be a certainty. The seat is claimed blind, so the second case is not
     *      eligible no matter how much nicer it turns out to be.
     */
    function test_CannotRerollIntoAnEasierDeal() public {
        uint256 first = _openCase(jane);
        vm.prank(jane);
        market.claimSeat(CASE_IX, first);
        _hearEveryone(jane, first);

        // Walk away and deal again. The new case is his, valid, and untouched.
        uint256 second = _openCase(jane);
        vm.prank(jane);
        vm.expectRevert(CaseMarket.AlreadyEntered.selector);
        market.claimSeat(CASE_IX, second);

        // And the stake still settles against the room he actually committed to.
        (, uint256 boundCase, , , , ) = market.entries(CASE_IX, jane);
        assertEq(boundCase, first, "bound to the room he sat down in");
    }

    /// @dev You cannot back a read you have not formed. The room opens in one go, so this
    ///      is the difference between having listened and not having bothered.
    function test_CannotStakeBeforeHearingTheRoom() public {
        uint256 id = _openCase(jane);
        vm.prank(jane);
        market.claimSeat(CASE_IX, id);

        vm.prank(jane);
        vm.expectRevert(CaseMarket.RoomNotHeard.selector);
        market.stake(CASE_IX, 1_000_000);
    }

    /// @dev And you cannot back one you already know the answer to.
    function test_CannotStakeAfterNamingSomeone() public {
        uint256 id = _openCase(jane);
        vm.prank(jane);
        market.claimSeat(CASE_IX, id);
        _hearEveryone(jane, id);

        vm.prank(jane);
        game.accuse(id, 0);
        processAllOperations();

        vm.prank(jane);
        vm.expectRevert(CaseMarket.CaseNotOpen.selector);
        market.stake(CASE_IX, 1_000_000);
    }

    function test_CannotStakeTwice() public {
        uint256 id = _enter(jane, 1_000_000);
        assertGt(id, 0);
        vm.prank(jane);
        vm.expectRevert(CaseMarket.AlreadyStaked.selector);
        market.stake(CASE_IX, 1_000_000);
    }

    /// @dev The clock runs from the moment you sit down, not from the moment you pay.
    function test_CannotStakeOnceYourClockHasRunOut() public {
        uint256 id = _openCase(jane);
        vm.prank(jane);
        market.claimSeat(CASE_IX, id);
        _hearEveryone(jane, id);

        vm.warp(block.timestamp + market.playWindow() + 1);
        vm.prank(jane);
        vm.expectRevert(CaseMarket.TooLate.selector);
        market.stake(CASE_IX, 1_000_000);
    }

    function test_CannotEnterAnUnconfiguredRound() public {
        uint256 id = _openCase(jane);
        vm.prank(jane);
        vm.expectRevert(CaseMarket.SpecNotSet.selector);
        market.claimSeat(9, id);
    }

    function test_CannotEnterOnceTheRoundHasClosed() public {
        (uint64 closesAt, , , , , ) = market.rounds(CASE_IX);
        vm.warp(closesAt);

        uint256 id = _openCase(jane);
        vm.prank(jane);
        vm.expectRevert(CaseMarket.RoundClosed.selector);
        market.claimSeat(CASE_IX, id);
    }

    // ── the clock ──────────────────────────────────────────────

    function test_SolvingInTimeWins() public {
        uint256 id = _enter(jane, 1_000_000);
        _play(jane, id, true);

        vm.prank(jane);
        market.recordResult(CASE_IX);

        (, , , , bool won, ) = _entry(jane);
        assertTrue(won, "named him, and named him in time");
        (, , uint128 winningStake, , uint32 winners, ) = market.rounds(CASE_IX);
        assertEq(winningStake, 1_000_000);
        assertEq(winners, 1);
    }

    /// @notice The time limit the user asked for: right answer, too late, still a loss.
    function test_SolvingAfterTheDeadlineLoses() public {
        uint256 id = _enter(jane, 1_000_000);
        vm.warp(block.timestamp + market.playWindow() + 1);
        _play(jane, id, true);

        vm.prank(jane);
        market.recordResult(CASE_IX);

        (, , , , bool won, ) = _entry(jane);
        assertFalse(won, "the clock beat her");
        (, , uint128 winningStake, , , ) = market.rounds(CASE_IX);
        assertEq(winningStake, 0, "a late solve funds the pot like any other loss");
    }

    function test_AccusingTheWrongManLoses() public {
        uint256 id = _enter(jane, 1_000_000);
        _play(jane, id, false);

        vm.prank(jane);
        market.recordResult(CASE_IX);

        (, , , , bool won, ) = _entry(jane);
        assertFalse(won);
    }

    function test_CannotRecordTwice() public {
        uint256 id = _enter(jane, 1_000_000);
        _play(jane, id, true);
        vm.startPrank(jane);
        market.recordResult(CASE_IX);
        vm.expectRevert(CaseMarket.AlreadyRecorded.selector);
        market.recordResult(CASE_IX);
        vm.stopPrank();
    }

    function test_CannotRecordAnUnfinishedCase() public {
        _enter(jane, 1_000_000);
        vm.prank(jane);
        vm.expectRevert(CaseMarket.CaseNotClosed.selector);
        market.recordResult(CASE_IX);
    }

    /**
     * @dev Shares are computed against `winningStake`, so a result recorded after the round
     *      sealed would shrink everyone else's share retroactively and promise out more than
     *      the pot holds. The first claimant would be paid on the old denominator.
     */
    function test_CannotRecordAfterTheRoundHasSealed() public {
        uint256 a = _enter(jane, 1_000_000);
        uint256 b = _enter(lisbon, 1_000_000);
        _play(jane, a, true);
        _play(lisbon, b, true);

        vm.prank(jane);
        market.recordResult(CASE_IX);
        _sealAfterWindow();

        vm.prank(lisbon);
        vm.expectRevert(CaseMarket.AlreadySealed.selector);
        market.recordResult(CASE_IX);

        // And the player who did record in time still owns the whole pot, undiluted.
        assertEq(market.shareOf(CASE_IX, jane), 2_000_000, "share is not retroactively cut");
        assertEq(usdc.balanceOf(address(market)), market.reserved(), "and the books still balance");
    }

    function test_RoundCannotSealEarly() public {
        vm.expectRevert(CaseMarket.RoundNotClosed.selector);
        market.sealRound(CASE_IX);
    }

    // ── the pot ────────────────────────────────────────────────

    /**
     * @notice The rule the user asked for in so many words: *the more money they put in
     *         towards their findings, the more share they get.* Two winners, one staking
     *         four times the other, against a loser who funds them both.
     */
    function test_PotSplitsProRataByConviction() public {
        uint256 a = _enter(jane, 4_000_000);
        uint256 b = _enter(lisbon, 1_000_000);
        uint256 c = _enter(cho, 2_000_000);

        _play(jane, a, true);
        _play(lisbon, b, true);
        _play(cho, c, false);

        vm.prank(jane);
        market.recordResult(CASE_IX);
        vm.prank(lisbon);
        market.recordResult(CASE_IX);
        vm.prank(cho);
        market.recordResult(CASE_IX);

        _sealAfterWindow();

        uint256 pot = 7_000_000;
        // Winning stake is 5 USDC; jane put up 4/5 of it and takes 4/5 of everything.
        assertEq(market.shareOf(CASE_IX, jane), (pot * 4) / 5, "conviction paid four to one");
        assertEq(market.shareOf(CASE_IX, lisbon), (pot * 1) / 5);
        assertEq(market.shareOf(CASE_IX, cho), 0, "wrong man, nothing");

        // And every winner beat their own stake, the loser's money is what made the difference.
        assertGt(market.shareOf(CASE_IX, jane), 4_000_000);
        assertGt(market.shareOf(CASE_IX, lisbon), 1_000_000);
    }

    function test_ClaimPaysInMegapotTickets() public {
        uint256 a = _enter(jane, 4_000_000);
        uint256 b = _enter(lisbon, 1_000_000);
        _play(jane, a, true);
        _play(lisbon, b, false);

        vm.prank(jane);
        market.recordResult(CASE_IX);
        vm.prank(lisbon);
        market.recordResult(CASE_IX);
        _sealAfterWindow();

        uint256 share = market.shareOf(CASE_IX, jane);
        assertEq(share, 5_000_000, "the whole pot, since she is the only one who solved it");

        vm.prank(jane);
        uint256[] memory ids = market.claim(CASE_IX);

        assertEq(ids.length, 5, "five whole tickets");
        assertEq(megapot.ticketsOf(jane), 5, "and Megapot issued them to her, not to us");
        assertEq(usdc.balanceOf(address(megapot)), 5_000_000, "her stake and his both went to Megapot");
    }

    /// @dev A share that isn't a whole number of tickets must not quietly stay with the house.
    function test_SubTicketRemainderGoesBackToThePlayer() public {
        uint256 a = _enter(jane, 1_500_000);
        _play(jane, a, true);
        vm.prank(jane);
        market.recordResult(CASE_IX);
        _sealAfterWindow();

        uint256 before = usdc.balanceOf(jane);
        vm.prank(jane);
        uint256[] memory ids = market.claim(CASE_IX);

        assertEq(ids.length, 1, "one ticket");
        assertEq(usdc.balanceOf(jane) - before, 500_000, "the half-ticket came back to her");
    }

    /// @dev Megapot's buyer refuses more than ten at a time, so a big share has to batch.
    function test_LargeShareBuysTicketsInBatches() public {
        market.setStakeRange(100_000, 30_000_000);

        uint256 a = _enter(jane, 25_000_000);
        _play(jane, a, true);
        vm.prank(jane);
        market.recordResult(CASE_IX);
        _sealAfterWindow();

        vm.prank(jane);
        uint256[] memory ids = market.claim(CASE_IX);
        assertEq(ids.length, 25, "twenty-five tickets across three calls");
        assertEq(megapot.ticketsOf(jane), 25);
        for (uint256 i; i < ids.length; ++i) assertGt(ids[i], 0, "every id was filled in");
    }

    function test_LosersCannotClaim() public {
        uint256 a = _enter(jane, 1_000_000);
        uint256 b = _enter(lisbon, 1_000_000);
        _play(jane, a, true);
        _play(lisbon, b, false);
        vm.prank(jane);
        market.recordResult(CASE_IX);
        vm.prank(lisbon);
        market.recordResult(CASE_IX);
        _sealAfterWindow();

        vm.prank(lisbon);
        vm.expectRevert(CaseMarket.NotAWinner.selector);
        market.claim(CASE_IX);
    }

    function test_CannotClaimBeforeTheRoundIsSealed() public {
        uint256 a = _enter(jane, 1_000_000);
        _play(jane, a, true);
        vm.prank(jane);
        market.recordResult(CASE_IX);

        vm.prank(jane);
        vm.expectRevert(CaseMarket.RoundNotSealed.selector);
        market.claim(CASE_IX);
    }

    function test_CannotClaimTwice() public {
        uint256 a = _enter(jane, 1_000_000);
        _play(jane, a, true);
        vm.prank(jane);
        market.recordResult(CASE_IX);
        _sealAfterWindow();

        vm.startPrank(jane);
        market.claim(CASE_IX);
        vm.expectRevert(CaseMarket.AlreadyClaimed.selector);
        market.claim(CASE_IX);
        vm.stopPrank();
    }

    /// @dev If nobody reads the room, nobody's money should be kept for reading it wrong.
    function test_NobodySolvedMeansEverybodyRefunded() public {
        uint256 a = _enter(jane, 1_000_000);
        uint256 b = _enter(lisbon, 2_000_000);
        _play(jane, a, false);
        _play(lisbon, b, false);
        vm.prank(jane);
        market.recordResult(CASE_IX);
        vm.prank(lisbon);
        market.recordResult(CASE_IX);
        _sealAfterWindow();

        uint256 aliceBefore = usdc.balanceOf(jane);
        vm.prank(jane);
        market.refund(CASE_IX);
        vm.prank(lisbon);
        market.refund(CASE_IX);

        assertEq(usdc.balanceOf(jane) - aliceBefore, 1_000_000, "got her stake back");
        assertEq(market.reserved(), 0, "and nothing is left owed");
        assertEq(usdc.balanceOf(address(market)), 0, "the house kept none of it");
    }

    function test_NoRefundWhileSomeoneCanStillClaim() public {
        uint256 a = _enter(jane, 1_000_000);
        uint256 b = _enter(lisbon, 1_000_000);
        _play(jane, a, true);
        _play(lisbon, b, false);
        vm.prank(jane);
        market.recordResult(CASE_IX);
        vm.prank(lisbon);
        market.recordResult(CASE_IX);
        _sealAfterWindow();

        vm.prank(lisbon);
        vm.expectRevert(CaseMarket.NotAWinner.selector);
        market.refund(CASE_IX);
    }

    // ── solvency ───────────────────────────────────────────────

    /**
     * @notice The invariant that matters: once the winners have been paid, the contract owes
     *         nothing, and the owner's surplus is only ever what Megapot sent back.
     */
    function test_ReservedDrainsToZeroOnceWinnersArePaid() public {
        uint256 a = _enter(jane, 4_000_000);
        uint256 b = _enter(lisbon, 1_000_000);
        uint256 c = _enter(cho, 2_000_000);
        assertEq(market.reserved(), 7_000_000);

        _play(jane, a, true);
        _play(lisbon, b, true);
        _play(cho, c, false);
        vm.prank(jane);
        market.recordResult(CASE_IX);
        vm.prank(lisbon);
        market.recordResult(CASE_IX);
        vm.prank(cho);
        market.recordResult(CASE_IX);
        _sealAfterWindow();

        vm.prank(jane);
        market.claim(CASE_IX);
        vm.prank(lisbon);
        market.claim(CASE_IX);

        assertEq(market.reserved(), 0, "nothing left owed to this round");
        assertEq(usdc.balanceOf(address(market)), 0, "and no stranded USDC");
    }

    /// @dev A second round's stakes must never be spendable as the first round's surplus.
    function test_OwnerCannotWithdrawAnotherRoundsStakes() public {
        market.configureRound(1, N, LIARS, FOCUS, TURN_AT);
        _enter(jane, 1_000_000);

        uint256 id = _openCase(lisbon);
        vm.prank(lisbon);
        market.claimSeat(1, id);
        _hearEveryone(lisbon, id);
        vm.prank(lisbon);
        market.stake(1, 2_000_000);

        vm.expectRevert(bytes("nothing spare"));
        market.withdrawSurplus(address(this));
    }

    function test_ClaimFailsLoudlyIfMegapotIsClosed() public {
        uint256 a = _enter(jane, 1_000_000);
        _play(jane, a, true);
        vm.prank(jane);
        market.recordResult(CASE_IX);
        _sealAfterWindow();

        megapot.setOpen(false);
        vm.prank(jane);
        vm.expectRevert(CaseMarket.PurchasesDisabled.selector);
        market.claim(CASE_IX);
    }

    // ── plumbing ───────────────────────────────────────────────

    function _entry(
        address who
    ) internal view returns (uint128, uint256, uint64, bool, bool, bool) {
        return market.entries(CASE_IX, who);
    }
}
