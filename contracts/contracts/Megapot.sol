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
    function ticketPrice() external view returns (uint256);

    function currentDrawingId() external view returns (uint256);

    function allowTicketPurchases() external view returns (bool);

    function referralFees(address referrer) external view returns (uint256);

    function claimReferralFees() external;
}
