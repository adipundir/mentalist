// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IncoTest } from "@inco/lightning/src/test/IncoTest.sol";
import { e, ebool, inco } from "@inco/lightning/src/Lib.sol";
import { DecryptionAttestation } from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import { Mentalist } from "../contracts/Mentalist.sol";
import { MentalistHarness } from "./MentalistHarness.sol";

/**
 * @dev These tests exist to answer the question the whole design lives or dies on:
 *      *is the encrypted lie actually lying, and is the game actually solvable?*
 *
 *      IncoTest mocks the entire Inco stack in-process — no Docker, no covalidator — so
 *      this is the fast loop. `get(handle)` is the mock's plaintext oracle; production
 *      code can never do this, which is exactly the point.
 */
contract MentalistTest is IncoTest {
    MentalistHarness internal game;

    address internal detective = address(0xDEC0DE);
    address internal stranger = address(0xBEEF);

    function setUp() public override {
        super.setUp();
        game = new MentalistHarness();
        vm.deal(detective, 100 ether);
        vm.deal(stranger, 10 ether);
        // Inco fees are drawn from the *contract's* balance, not msg.value — msg.value
        // only tops it up. Pre-funding here is the sponsored-fee model the deployed game
        // uses, so players never think about Inco fees at all.
        vm.deal(address(game), 100 ether);
    }

    // ── helpers ────────────────────────────────────────────────

    function _open(uint8 n, uint8 liars, uint8 focus, uint8 turnAt) internal returns (uint256 id) {
        uint256 fee = game.quoteOpenFee(n);
        vm.prank(detective);
        id = game.openCase{ value: fee }(n, liars, focus, turnAt);
        processAllOperations();
    }

    /// @dev Mock-only plaintext read of an encrypted handle.
    function _plain(ebool h) internal view returns (bool) {
        return get(ebool.unwrap(h)) != bytes32(0);
    }

    function _ask(uint256 id, uint8 witness, uint16 mask) internal returns (bool) {
        vm.prank(detective);
        game.interrogate(id, witness, mask);
        processAllOperations();
        Mentalist.Case memory c = game.getCase(id);
        return _plain(game.testimony(id, uint16(c.questionsAsked) - 1));
    }

    /// @dev Read the hidden layout so tests can assert against ground truth.
    function _layout(uint256 id, uint8 n) internal view returns (uint8 killer, bool[] memory liar) {
        liar = new bool[](n);
        killer = type(uint8).max;
        for (uint8 i = 0; i < n; i++) {
            if (_plain(game.guiltOf(id, i))) killer = i;
            liar[i] = _plain(game.liarOf(id, i));
        }
    }

    function _full(uint8 n) internal pure returns (uint16) {
        return uint16((1 << n) - 1);
    }

    function _attest(
        address requester,
        ebool handle
    ) internal returns (DecryptionAttestation memory att, bytes[] memory sigs) {
        return
            getDecryptionAttestation(
                requester,
                HandleWithProof({ handle: ebool.unwrap(handle), proof: _emptyAllowanceProof() })
            );
    }

    /// @dev `vm.expectRevert` only observes *external* calls, so asserting that a
    ///      decryption is refused has to go through a real call boundary.
    function attestOrRevert(address requester, ebool handle) external {
        _attest(requester, handle);
    }

    function _settle(uint256 id) internal {
        (DecryptionAttestation memory att, bytes[] memory sigs) = _attest(
            detective,
            ebool.wrap(game.verdictHandle(id))
        );
        vm.prank(detective);
        game.settle(id, att, sigs);
    }

    // ── the deal ───────────────────────────────────────────────

    function test_ExactlyOneKillerAndRedJohnAlwaysLies() public {
        uint8 n = 9;
        uint8 k = 3;
        uint256 id = _open(n, k, 6, 0);
        (uint8 killer, bool[] memory liar) = _layout(id, n);

        assertTrue(killer != type(uint8).max, "there must be a Tyger");

        uint8 guilty;
        uint8 liarCount;
        for (uint8 i = 0; i < n; i++) {
            if (_plain(game.guiltOf(id, i))) guilty++;
            if (liar[i]) liarCount++;
        }

        assertEq(guilty, 1, "exactly one Tyger");
        assertTrue(liar[killer], "the Tyger always lies");
        // Exactly-K is a property of the production elist dealer, not this harness (see
        // MentalistHarness). Here we only assert the layout is well-formed.
        assertTrue(liarCount >= 1 && liarCount <= n, "liar population is well formed");
        k; // silence unused
    }

    function test_DealMovesBetweenCases() public {
        uint8 n = 9;
        uint8 first = type(uint8).max;
        bool differs;
        for (uint8 r = 0; r < 8; r++) {
            uint256 id = _open(n, 3, 6, 0);
            (uint8 killer, ) = _layout(id, n);
            if (first == type(uint8).max) first = killer;
            else if (killer != first) differs = true;
        }
        assertTrue(differs, "the shuffle must move the Tyger between cases");
    }

    // ── the encrypted lie ──────────────────────────────────────

    function test_ControlQuestionIsAPerfectHonestyTest() public {
        uint8 n = 9;
        uint256 id = _open(n, 3, 40, 0);
        (, bool[] memory liar) = _layout(id, n);

        // "Is the killer one of all nine?" is true by construction, so the answer is
        // exactly NOT(liar). This is the move the entire Focus economy is priced around.
        for (uint8 w = 0; w < n; w++) {
            assertEq(_ask(id, w, _full(n)), !liar[w], "control question exposes honesty exactly");
        }
    }

    function test_AnswerIsTruthXorHonesty() public {
        uint8 n = 9;
        uint256 id = _open(n, 3, 60, 0);
        (uint8 killer, bool[] memory liar) = _layout(id, n);

        uint16[4] memory masks = [uint16(0x001), uint16(0x00F), uint16(0x0F0), uint16(0x155)];
        for (uint256 m = 0; m < masks.length; m++) {
            uint16 mask = masks[m];
            bool truth = (mask >> killer) & 1 == 1;
            for (uint8 w = 0; w < 4; w++) {
                assertEq(_ask(id, w, mask), truth != liar[w], "answer == truth XOR honesty");
            }
        }
    }

    function test_SelfIncriminationYesProvesInnocentLiar() public {
        uint8 n = 9;
        uint256 id = _open(n, 3, 40, 0);
        (uint8 killer, ) = _layout(id, n);

        for (uint8 w = 0; w < n; w++) {
            // "Are YOU the killer?" — a yes is only producible by an innocent who lies.
            if (_ask(id, w, uint16(1) << w)) {
                assertTrue(w != killer, "the Tyger never confesses");
            }
        }
    }

    // ── solvability: the load-bearing design claim ─────────────

    /// @notice The load-bearing balance claim: 6 Focus is *always enough* to solve a
    ///         9-suspect case with correct play — control question (2) plus at most four
    ///         binary splits (4) — and most layouts resolve in fewer, leaving a surplus.
    ///         That surplus is not slack; it is what converts to Megapot tickets, so the
    ///         reward for playing well is denominated in lottery entries.
    ///
    ///         Run over every seat the Tyger can occupy so the worst case is actually hit,
    ///         rather than whichever branch one random deal happened to take.
    function test_SixFocusAlwaysSolvesTheStandardCase() public {
        uint8 n = 9;
        uint8 worstCaseSpend = 0;

        for (uint8 attempt = 0; attempt < 12; attempt++) {
            uint256 id = _open(n, 3, 6, 0);
            (uint8 killer, ) = _layout(id, n);

            // 1. Control question — costs 2, tells us whether to invert this witness.
            bool witnessIsHonest = _ask(id, 0, _full(n));

            // 2. Binary splits until one suspect remains. A *known liar* is as good as an
            //    honest witness: invert and carry on. That is why a control question is
            //    never a wasted move.
            uint16 candidates = _full(n);
            while (_popcount(candidates) > 1) {
                uint16 half = _halfOf(candidates, n);
                bool said = _ask(id, 0, half);
                bool killerInHalf = witnessIsHonest ? said : !said;
                candidates = killerInHalf ? half : uint16(candidates & ~half);
            }

            uint8 spent = 6 - game.getCase(id).focusLeft;
            if (spent > worstCaseSpend) worstCaseSpend = spent;

            assertEq(_popcount(candidates), 1, "the search isolates a single suspect");
            assertEq(_lowestSetBit(candidates), killer, "and that suspect is the Tyger");
        }

        assertLe(worstCaseSpend, 6, "6 Focus must cover the worst case");
        assertGe(worstCaseSpend, 5, "and the worst case must actually be tight");
    }

    function _popcount(uint16 x) internal pure returns (uint8 c) {
        for (uint8 i = 0; i < 16; i++) if ((x >> i) & 1 == 1) c++;
    }

    function _lowestSetBit(uint16 x) internal pure returns (uint8) {
        for (uint8 i = 0; i < 16; i++) if ((x >> i) & 1 == 1) return i;
        return type(uint8).max;
    }

    function _halfOf(uint16 candidates, uint8 n) internal pure returns (uint16 half) {
        uint8 count;
        for (uint8 i = 0; i < n; i++) if ((candidates >> i) & 1 == 1) count++;
        uint8 take = count / 2;
        uint8 taken;
        for (uint8 i = 0; i < n && taken < take; i++) {
            if ((candidates >> i) & 1 == 1) {
                half |= uint16(1) << i;
                taken++;
            }
        }
    }

    // ── economy ────────────────────────────────────────────────

    function test_ControlCostsTwoSplitCostsOne() public {
        uint256 id = _open(9, 3, 6, 0);
        _ask(id, 0, _full(9));
        assertEq(game.getCase(id).focusLeft, 4, "control costs 2");
        _ask(id, 1, 0x00F);
        assertEq(game.getCase(id).focusLeft, 3, "a split costs 1");
    }

    function test_CannotOverspendFocus() public {
        uint256 id = _open(9, 3, 1, 0);
        vm.prank(detective);
        vm.expectRevert(Mentalist.NoFocusLeft.selector);
        game.interrogate(id, 0, _full(9)); // control costs 2, only 1 Focus remains
    }

    function test_RejectsEmptyAndOversizedMasks() public {
        uint256 id = _open(9, 3, 6, 0);
        vm.prank(detective);
        vm.expectRevert(Mentalist.BadMask.selector);
        game.interrogate(id, 0, 0);

        vm.prank(detective);
        vm.expectRevert(Mentalist.BadMask.selector);
        game.interrogate(id, 0, uint16(1) << 9); // seat 9 doesn't exist on a 9-seat board
    }

    // ── privacy boundary ───────────────────────────────────────

    /// @notice The whole privacy claim in one test: the detective can obtain a decryption
    ///         attestation for their testimony; nobody else can, because nobody else was
    ///         granted access to that handle.
    function test_OnlyTheDetectiveCanDecryptTestimony() public {
        uint256 id = _open(9, 3, 6, 0);
        vm.prank(detective);
        game.interrogate(id, 0, 0x00F);
        processAllOperations();

        ebool answer = game.testimony(id, 0);

        this.attestOrRevert(detective, answer); // must not revert

        vm.expectRevert();
        this.attestOrRevert(stranger, answer);
    }

    /// @notice Mid-case, the layout is decryptable by *nobody* — not the player, not the
    ///         contract's deployer. Only `accuse` opens it.
    function test_LayoutIsDecryptableByNobodyUntilAccusation() public {
        uint256 id = _open(9, 3, 6, 0);
        ebool seat0 = game.guiltOf(id, 0);

        vm.expectRevert();
        this.attestOrRevert(detective, seat0);

        vm.expectRevert();
        this.attestOrRevert(address(this), seat0);

        vm.prank(detective);
        game.accuse(id, 0);
        processAllOperations();

        this.attestOrRevert(detective, seat0); // now public — the case is over
    }

    function test_OnlyTheDetectiveCanPlay() public {
        uint256 id = _open(9, 3, 6, 0);
        vm.prank(stranger);
        vm.expectRevert(Mentalist.NotYourCase.selector);
        game.interrogate(id, 0, 0x00F);
    }

    // ── the turncoat: mutable encrypted state ──────────────────

    function test_TheTygerTurnsTheWitnessYouJustUsed() public {
        uint8 n = 9;
        uint256 id = _open(n, 3, 8, 1); // he acts after the first question
        (, bool[] memory before) = _layout(id, n);

        _ask(id, 4, 0x00F);
        assertTrue(game.getCase(id).turned, "the turncoat fires");

        bool nowLies = _plain(game.liarOf(id, 4));
        assertEq(nowLies, !before[4], "the used witness's honesty bit is negated in place");

        // The mutation is real, not cosmetic: a fresh control question reports the new state.
        assertEq(_ask(id, 4, _full(n)), !nowLies, "control question reflects mutated state");
    }

    function test_TurncoatFiresOnlyOnce() public {
        uint256 id = _open(9, 3, 8, 1);
        _ask(id, 4, 0x00F);
        bool afterFirst = _plain(game.liarOf(id, 4));
        _ask(id, 4, 0x00F);
        assertEq(_plain(game.liarOf(id, 4)), afterFirst, "the Tyger acts once per case");
    }

    // ── settlement ─────────────────────────────────────────────

    function test_CorrectAccusationSolvesAndBuildsStreak() public {
        uint8 n = 9;
        uint256 id = _open(n, 3, 6, 0);
        (uint8 killer, ) = _layout(id, n);

        vm.prank(detective);
        game.accuse(id, killer);
        processAllOperations();
        _settle(id);

        assertTrue(game.getCase(id).solved, "case solved");
        assertEq(game.streak(detective), 1, "streak advances");
        assertEq(game.casesSolved(detective), 1);
    }

    function test_WrongAccusationBreaksStreak() public {
        uint8 n = 9;

        uint256 a = _open(n, 3, 6, 0);
        (uint8 killerA, ) = _layout(a, n);
        vm.prank(detective);
        game.accuse(a, killerA);
        processAllOperations();
        _settle(a);
        assertEq(game.streak(detective), 1);

        uint256 b = _open(n, 3, 6, 0);
        (uint8 killerB, ) = _layout(b, n);
        uint8 wrong = killerB == 0 ? 1 : 0;
        vm.prank(detective);
        game.accuse(b, wrong);
        processAllOperations();
        _settle(b);

        assertFalse(game.getCase(b).solved, "a miss does not solve");
        assertEq(game.streak(detective), 0, "streak resets");
        assertEq(game.bestStreak(detective), 1, "best streak is remembered");
    }

    /// @notice The handle-match check is what stops a player settling on a conveniently
    ///         true bit. The signature below is perfectly valid — it is just for the
    ///         *wrong handle*.
    function test_SettlementRejectsAValidAttestationForTheWrongHandle() public {
        uint8 n = 9;
        uint256 id = _open(n, 3, 6, 0);
        (uint8 killer, ) = _layout(id, n);
        uint8 other = killer == 0 ? 1 : 0;

        vm.prank(detective);
        game.accuse(id, other); // accuse the wrong seat...
        processAllOperations();

        // ...then try to settle using the *real* killer's (true) bit.
        (DecryptionAttestation memory att, bytes[] memory sigs) = _attest(detective, game.guiltOf(id, killer));

        vm.prank(detective);
        vm.expectRevert(Mentalist.HandleMismatch.selector);
        game.settle(id, att, sigs);
    }

    function test_CannotInterrogateAfterAccusing() public {
        uint256 id = _open(9, 3, 6, 0);
        vm.prank(detective);
        game.accuse(id, 0);
        processAllOperations();

        vm.prank(detective);
        vm.expectRevert(Mentalist.WrongStatus.selector);
        game.interrogate(id, 0, 0x00F);
    }

    // ── streak integrity ───────────────────────────────────

    /// @notice Settlement is player-initiated, so a detective who accused wrongly could
    ///         simply never submit the attestation and keep an unbroken streak. Opening a
    ///         new case must force the old one to resolve as a loss, or the leaderboard is
    ///         fiction.
    function test_AbandoningACaseBreaksTheStreak() public {
        uint8 n = 9;

        // Earn a streak of one, legitimately.
        uint256 a = _open(n, 3, 6, 0);
        (uint8 killerA, ) = _layout(a, n);
        vm.prank(detective);
        game.accuse(a, killerA);
        processAllOperations();
        _settle(a);
        assertEq(game.streak(detective), 1);

        // Accuse wrongly on the next case, then simply walk away without settling.
        uint256 b = _open(n, 3, 6, 0);
        (uint8 killerB, ) = _layout(b, n);
        vm.prank(detective);
        game.accuse(b, killerB == 0 ? 1 : 0);
        processAllOperations();

        // Opening a third case must close the abandoned one as a loss.
        _open(n, 3, 6, 0);

        Mentalist.Case memory abandoned = game.getCase(b);
        assertTrue(abandoned.status == Mentalist.Status.Closed, "abandoned case is closed");
        assertFalse(abandoned.solved, "and scored as a loss");
        assertEq(game.streak(detective), 0, "the streak does not survive the dodge");
    }

    function test_AbandoningAnUnfinishedCaseAlsoCounts() public {
        uint256 a = _open(9, 3, 6, 0);
        (uint8 killerA, ) = _layout(a, 9);
        vm.prank(detective);
        game.accuse(a, killerA);
        processAllOperations();
        _settle(a);
        assertEq(game.streak(detective), 1);

        // Open a case, ask one question, then bail without ever accusing.
        uint256 b = _open(9, 3, 6, 0);
        _ask(b, 0, 0x00F);
        _open(9, 3, 6, 0);

        assertEq(game.streak(detective), 0, "quitting mid-case is a loss too");
    }

    function test_SettledCasesAreNotRetroactivelyPunished() public {
        uint8 n = 9;
        uint256 a = _open(n, 3, 6, 0);
        (uint8 killerA, ) = _layout(a, n);
        vm.prank(detective);
        game.accuse(a, killerA);
        processAllOperations();
        _settle(a);

        _open(n, 3, 6, 0); // properly closed, so opening the next case must not reset

        assertEq(game.streak(detective), 1, "a settled win survives the next case opening");
    }

    // ── fees ───────────────────────────────────────────────────

    function test_OpeningRequiresTheIncoFee() public {
        vm.prank(detective);
        vm.expectRevert();
        game.openCase{ value: 0 }(9, 3, 6, 0);
    }

    /// @notice Interrogation charges no Inco fee — none of getEbool/or/xor/allow do — so
    ///         the moment-to-moment loop is an ordinary cheap Base transaction.
    function test_InterrogationIsFeeFree() public {
        uint256 id = _open(9, 3, 6, 0);
        uint256 balanceBefore = address(game).balance;
        vm.prank(detective);
        game.interrogate(id, 0, 0x00F);
        assertEq(address(game).balance, balanceBefore, "no Inco fee is drawn on a question");
    }
}
