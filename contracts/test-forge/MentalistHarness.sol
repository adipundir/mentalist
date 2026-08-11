// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { e, ebool, euint256 } from "@inco/lightning/src/Lib.sol";
import { Mentalist } from "../contracts/Mentalist.sol";

/**
 * @title  MentalistHarness — test-only dealer
 *
 * @notice Identical to `Mentalist` in every rule; it only swaps *how the case is dealt*.
 *
 * @dev    Why this exists: the Inco Lightning v1.0.0 package's in-process Foundry mock implements
 *         the scalar encrypted operations but not the elist ones, so production's
 *         `newEList` + `shuffle` dealer cannot execute under `forge test`. This harness
 *         deals an equivalent layout using only mock-supported primitives:
 *
 *           - the Tyger is a single hidden index — `e.randBounded(n)` then `e.eq` per seat,
 *             which is exactly uniform and is the idiomatic primitive for "which one of N".
 *           - Honesty is an independent draw per seat, then welded to guilt with `e.or`
 *             exactly as production does.
 *
 *         The one property this dealer does NOT reproduce is *exactly K liars* — here the
 *         count is binomial. Tests therefore assert the game's rules (the encrypted lie,
 *         the Focus economy, access control, the turncoat, settlement) rather than the
 *         liar count, and the exact-K guarantee is asserted in the Hardhat integration
 *         test against a live covalidator.
 */
contract MentalistHarness is Mentalist {
    using e for *;

    /// @dev Percentage chance any given innocent lies, chosen to sit near `liars / n`.
    uint256 internal constant LIAR_RATE_PCT = 33;

    function _deal(uint256 caseId, uint8 suspects, uint8 /* liars */) internal override {
        euint256 redJohnSeat = e.randBounded(uint256(suspects));

        for (uint8 i = 0; i < suspects; i++) {
            ebool guilty = e.eq(redJohnSeat, e.asEuint256(uint256(i)));
            ebool lies = e.or(e.lt(e.randBounded(100), e.asEuint256(LIAR_RATE_PCT)), guilty);
            _seat(caseId, i, guilty, lies);
        }
    }
}
