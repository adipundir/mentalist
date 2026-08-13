// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * Megapot, as much of it as this game touches.
 *
 * Two facts here cost real time to establish and are both confirmed against Base Sepolia by
 * RPC rather than read off a docs page:
 *
 *   - The live protocol is V2 (`Jackpot` plus `JackpotRandomTicketBuyer`). The V1
 *     `BaseJackpot` / `purchaseTickets` API that fills every search result is archived and
 *     incompatible.
 *   - `_referralSplitBps` is 1e18-scaled despite the name, and must sum to exactly 1e18.
 *     Passing basis points silently mis-splits the fee.
 *
 * Nothing else about Megapot is hardcoded anywhere: the jackpot address and the ticket token
 * are read off the buyer at construction, and the ticket price is read live on every payout.
 */

interface IJackpotRandomTicketBuyer {
    /// @param _referralSplitBps despite the name, this is 1e18-scaled and MUST sum to 1e18
    function buyTickets(
        uint256 _count,
        address _recipient,
        address[] calldata _referrers,
        uint256[] calldata _referralSplitBps,
        bytes32 _source
    ) external returns (uint256[] memory ticketIds);

    function jackpot() external view returns (address);

    function usdc() external view returns (address);
}

interface IJackpot {
    /** Five unique normals in [1, ballMax] and one bonusball in [1, bonusballMax]. */
    struct Ticket {
        uint8[] normals;
        uint8 bonusball;
    }

    function ticketPrice() external view returns (uint256);

    function currentDrawingId() external view returns (uint256);

    function allowTicketPurchases() external view returns (bool);

    function referralFees(address referrer) external view returns (uint256);

    function claimReferralFees() external;
}

/**
 * Megapot's bulk route. `createBatchOrder` registers an order and Megapot's own keeper mints
 * it out across later transactions, so the cost of ordering does not scale with the count:
 * twenty-five tickets ordered for 277k gas, against 1.3M to mint a single one immediately.
 * That is the whole reason it exists, and the only way a winner converts a large share.
 *
 * One live order per recipient, so `hasActiveBatchOrder` has to be checked before creating.
 */
interface IBatchPurchaseFacilitator {
    function createBatchOrder(
        address recipient,
        uint64 dynamicTicketCount,
        IJackpot.Ticket[] calldata userStaticTickets,
        address[] calldata referrers,
        uint256[] calldata referralSplit,
        bytes32 source
    ) external;

    function hasActiveBatchOrder(address recipient) external view returns (bool);

    function minimumTicketCount() external view returns (uint256);
}
