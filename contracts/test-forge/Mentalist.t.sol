// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IncoTest } from "@inco/lightning/src/test/IncoTest.sol";
import { e, ebool, euint256, inco } from "@inco/lightning/src/Lib.sol";
import { DecryptionAttestation } from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import { Mentalist } from "../contracts/Mentalist.sol";

/**
 * @dev The question this design lives or dies on: *is the man who cannot be telling the
 *      truth actually hidden, and is he hidden somewhere different every time?*
 *
 *      The words the suspects say are written down in the open, in the frontend, where
 *      anyone can read them. The only secret is which mouth the impossible account comes out
 *      of, and that is dealt here, inside the enclave, per case.
 *
 *      IncoTest mocks the entire Inco stack in-process, no Docker and no covalidator, so
 *      this is the fast loop. `get(handle)` is the mock's plaintext oracle; production code
 *      can never do this, which is exactly the point.
 *
 *      There is no test harness any more. The old dealer needed encrypted lists and a
 *      shuffle, which the in-process mock does not implement, so the suite ran against a
 *      substitute dealer and the real one was only ever exercised on a live network. The new
 *      one needs a single bounded random draw and some comparisons, all of which the mock
 *      supports, so these tests run the production dealing code exactly as deployed.
 */
contract MentalistTest is IncoTest {
    Mentalist internal game;

    address internal detective = address(0xDEC0DE);
    address internal stranger = address(0xBEEF);

    function setUp() public override {
        super.setUp();
        game = new Mentalist();
        vm.deal(detective, 100 ether);
        vm.deal(stranger, 10 ether);
        // Inco fees are drawn from the *contract's* balance, msg.value only tops it up.
        // Pre-funding here is the sponsored-fee model the deployed game uses, so players
        // never have to think about Inco fees at all.
        vm.deal(address(game), 100 ether);
    }

    // ── helpers ────────────────────────────────────────────────

    function _open(uint8 n) internal returns (uint256 id) {
        uint256 fee = game.quoteOpenFee(n);
        vm.prank(detective);
        id = game.openCase{ value: fee }(n, 1, n, 0);
        processAllOperations();
    }

    function _plain(ebool h) internal view returns (bool) {
        return get(ebool.unwrap(h)) != bytes32(0);
    }

    function _slot(uint256 id, uint8 seat) internal view returns (uint256) {
        return uint256(get(euint256.unwrap(game.statementOf(id, seat))));
    }

    /// @dev Which seat was dealt the account that cannot be true.
    function _liarSeat(uint256 id, uint8 n) internal view returns (uint8 seat, uint8 count) {
        seat = type(uint8).max;
        for (uint8 i = 0; i < n; i++) {
            if (_plain(game.guiltOf(id, i))) {
                seat = i;
                count++;
            }
        }
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

    /// @dev `vm.expectRevert` only observes *external* calls, so asserting that a decryption
    ///      is refused has to go through a real call boundary.
    function attestOrRevert(address requester, bytes32 handle) external {
        _attest(requester, handle);
    }

    function _settle(uint256 id) internal {
        (DecryptionAttestation memory att, bytes[] memory sigs) = _attest(
            detective,
            game.verdictHandle(id)
        );
        vm.prank(detective);
        game.settle(id, att, sigs);
    }

    function _play(uint256 id, uint8 n, bool correct) internal {
        vm.prank(detective);
        game.beginHearing(id);
        processAllOperations();

        (uint8 liar, ) = _liarSeat(id, n);
        uint8 named = correct ? liar : (liar + 1) % n;
        vm.prank(detective);
        game.accuse(id, named);
        processAllOperations();
        _settle(id);
    }

    // ── the deal ───────────────────────────────────────────────

    /// @notice Exactly one man in the room is giving the account that cannot be true.
    function test_ExactlyOneManIsLying() public {
        for (uint8 n = 3; n <= 8; n++) {
            uint256 id = _open(n);
            (uint8 seat, uint8 count) = _liarSeat(id, n);
            assertEq(count, 1, "exactly one impossible account per room");
            assertLt(seat, n, "and it sits on a real seat");
            _play(id, n, true); // resolve it, so the next open is not an abandon
        }
    }

    /**
     * @notice And he is a different man each time.
     *
     * @dev This is why the answer is dealt on chain instead of written in a file. If the
     *      liar were authored, every player would be hunting the same man and the first
     *      person to solve a case could simply tell everyone else.
     */
    function test_TheLiarMovesBetweenDeals() public {
        uint8 n = 4;
        bool[4] memory seen;
        uint8 distinct;

        for (uint8 k = 0; k < 24; k++) {
            uint256 id = _open(n);
            (uint8 seat, ) = _liarSeat(id, n);
            if (!seen[seat]) {
                seen[seat] = true;
                distinct++;
            }
            _play(id, n, true);
        }

        assertGe(distinct, 3, "the liar is not pinned to one seat");
    }

    /**
     * @notice Everyone gets his own account, and only the liar gets the impossible one.
     *
     * @dev The honest accounts are handed out in written order, skipping whoever holds the
     *      tell. Two men giving the same account would read as a bug, and an innocent man
     *      dealt the impossible account would give the case two answers.
     */
    function test_EveryManGetsHisOwnAccountAndOnlyTheLiarGetsTheTell() public {
        for (uint8 n = 3; n <= 8; n++) {
            uint256 id = _open(n);
            (uint8 liar, ) = _liarSeat(id, n);

            bool[9] memory used;
            for (uint8 i = 0; i < n; i++) {
                uint256 slot = _slot(id, i);
                assertLt(slot, n, "slot is a real account");
                assertFalse(used[slot], "no two men give the same account");
                used[slot] = true;

                if (i == liar) {
                    assertEq(slot, uint256(n) - 1, "the liar is handed the impossible account");
                } else {
                    assertLt(slot, uint256(n) - 1, "and nobody else is");
                }
            }
            _play(id, n, true);
        }
    }

    // ── access ─────────────────────────────────────────────────

    /**
     * @notice Nobody can read the room until they open it, and only its own detective can.
     *
     * @dev The entire confidentiality claim, in one test. If the accounts were readable off
     *      chain by anyone, the page would know the answer before a single question was
     *      asked and every wallet would be betting on a certainty.
     */
    function test_TheRoomIsUnreadableUntilYouOpenIt() public {
        uint256 id = _open(4);
        bytes32 h = euint256.unwrap(game.statementOf(id, 0));

        vm.expectRevert();
        this.attestOrRevert(detective, h);

        vm.prank(detective);
        game.beginHearing(id);
        processAllOperations();

        // now the detective, and still nobody else
        this.attestOrRevert(detective, h);
        vm.expectRevert();
        this.attestOrRevert(stranger, h);
    }

    function test_OnlyTheDetectiveCanOpenTheRoom() public {
        uint256 id = _open(4);
        vm.prank(stranger);
        vm.expectRevert(Mentalist.NotYourCase.selector);
        game.beginHearing(id);
    }

    /// @dev One hearing per case: the whole room opens at once, so there is nothing to repeat.
    function test_TheRoomOpensOnce() public {
        uint256 id = _open(4);
        vm.startPrank(detective);
        game.beginHearing(id);
        vm.expectRevert(Mentalist.AlreadyHeard.selector);
        game.beginHearing(id);
        vm.stopPrank();
    }

    function test_OnlyTheDetectiveCanAccuse() public {
        uint256 id = _open(4);
        vm.prank(detective);
        game.beginHearing(id);
        processAllOperations();

        vm.prank(stranger);
        vm.expectRevert(Mentalist.NotYourCase.selector);
        game.accuse(id, 0);
    }

    // ── the verdict ────────────────────────────────────────────

    /// @notice The contract rules on the accusation, not the client.
    function test_NamingTheLiarSolvesTheCase() public {
        uint256 id = _open(5);
        _play(id, 5, true);

        Mentalist.Case memory c = game.getCase(id);
        assertTrue(c.solved, "the contract agrees");
        assertTrue(c.status == Mentalist.Status.Closed);
        assertEq(game.streak(detective), 1);
        assertEq(game.casesSolved(detective), 1);
    }

    function test_NamingAnyoneElseDoesNot() public {
        uint256 id = _open(5);
        _play(id, 5, false);

        Mentalist.Case memory c = game.getCase(id);
        assertFalse(c.solved, "wrong man");
        assertEq(game.streak(detective), 0);
    }

    function test_TheStreakSurvivesConsecutiveWins() public {
        for (uint8 k = 0; k < 3; k++) {
            uint256 id = _open(4);
            _play(id, 4, true);
        }
        assertEq(game.streak(detective), 3);
        assertEq(game.bestStreak(detective), 3);
    }

    function test_CannotSettleSomeoneElsesCase() public {
        uint256 id = _open(4);
        vm.prank(detective);
        game.beginHearing(id);
        processAllOperations();
        vm.prank(detective);
        game.accuse(id, 0);
        processAllOperations();

        (DecryptionAttestation memory att, bytes[] memory sigs) = _attest(
            detective,
            game.verdictHandle(id)
        );
        vm.prank(stranger);
        vm.expectRevert(Mentalist.NotYourCase.selector);
        game.settle(id, att, sigs);
    }

    // ── walking away ───────────────────────────────────────────

    /**
     * @notice A case you named someone in cannot be abandoned, only filed.
     *
     * @dev Settlement is player-initiated, so a detective who named the wrong man could once
     *      leave the case hanging and open a fresh one with their streak intact. Force
     *      closing it as a loss was the original fix, and it is wrong now that a case can
     *      carry a stake: it would rewrite a win as a loss for anyone one transaction away
     *      from filing. The dodge is refused outright instead.
     */
    function test_AnAccusedCaseCannotBeAbandoned() public {
        uint256 id = _open(4);
        vm.prank(detective);
        game.beginHearing(id);
        processAllOperations();
        vm.prank(detective);
        game.accuse(id, 0);
        processAllOperations();

        uint256 fee = game.quoteOpenFee(4);
        vm.prank(detective);
        vm.expectRevert(abi.encodeWithSelector(Mentalist.UnsettledCase.selector, id));
        game.openCase{ value: fee }(4, 1, 4, 0);
    }

    /// @dev A room you walked out of without naming anyone is a genuine walk-away, and a loss.
    function test_WalkingAwayBeforeNamingAnyoneIsALoss() public {
        uint256 first = _open(4);
        _play(first, 4, true);
        assertEq(game.streak(detective), 1);

        uint256 abandoned = _open(4);
        vm.prank(detective);
        game.beginHearing(abandoned);
        processAllOperations();

        _open(4); // opening another resolves the one left behind

        Mentalist.Case memory c = game.getCase(abandoned);
        assertTrue(c.status == Mentalist.Status.Closed, "closed");
        assertFalse(c.solved, "and scored as a loss");
        assertEq(game.streak(detective), 0, "the streak does not survive it");
    }

    /// @dev The bug that rule replaced: opening another case must never undo a filed win.
    function test_OpeningAnotherCaseCannotDestroyAFiledWin() public {
        uint256 id = _open(4);
        _play(id, 4, true);
        _open(4);

        Mentalist.Case memory won = game.getCase(id);
        assertTrue(won.solved, "the win survives");
        assertTrue(won.status == Mentalist.Status.Closed);
    }

    // ── configuration ──────────────────────────────────────────

    function test_RejectsRoomsTooSmallOrTooLarge() public {
        uint256 fee = game.quoteOpenFee(4);
        vm.startPrank(detective);
        vm.expectRevert(Mentalist.BadConfig.selector);
        game.openCase{ value: fee }(2, 1, 2, 0);
        vm.expectRevert(Mentalist.BadConfig.selector);
        game.openCase{ value: fee }(13, 1, 13, 0);
        vm.stopPrank();
    }

    function test_OpeningACaseCostsAnIncoFee() public {
        assertGt(game.quoteOpenFee(6), 0, "opening a case costs something");
    }
}
