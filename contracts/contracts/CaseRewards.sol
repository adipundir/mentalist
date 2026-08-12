// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Mentalist } from "./Mentalist.sol";

/// @notice Megapot's on-chain quick-pick buyer. Verified live on Base Sepolia at
///         0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746 (jackpot() and usdc() both point at
///         the live V2 deployment). ABI mirrored from https://llms.megapot.io/abi/JackpotRandomTicketBuyer.json
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

/**
 * @title  CaseRewards: solve the case, earn the long shot
 *
 * @notice The Megapot half of MENTALIST, and the reason the Focus economy has teeth.
 *
 *         Unspent Focus at the moment you close a case converts 1:1 into **real Megapot
 *         lottery tickets**, minted straight to your wallet. Solving in four Focus instead
 *         of six is worth two extra shots at the jackpot, so playing well is denominated
 *         in lottery entries rather than in a number going up.
 *
 *         Three properties make this a core-loop integration rather than a link-out:
 *
 *         1. **The game funds the tickets.** Megapot's gifting flow lets a payer buy for
 *            an arbitrary recipient, "tickets are never free, you fund every gift". This
 *            contract is the payer and the player is the recipient, so a player who has
 *            never held USDC still walks away holding a genuine lottery ticket NFT.
 *
 *         2. **The tickets pay for themselves.** This contract passes itself as the
 *            `_referrers` entry, earning the protocol's referral fee (10% of ticket price
 *            at purchase, plus a share of referred winnings at claim). Those fees accrue
 *            inside the Jackpot and are swept back into this treasury, which is what funds
 *            the next round of rewards. The loop closes.
 *
 *         3. **The reward is earned, not granted.** Ticket count is a function of skill, *            surplus Focus plus a streak bonus, not of spend.
 *
 * @dev    Deliberately decoupled from `Mentalist`: the game contract knows nothing about
 *         lotteries and stays independently deployable on its own for the Inco track.
 */
contract CaseRewards is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────── constants

    /// @dev Megapot's quick-pick buyer rejects counts outside 1..10 with InvalidTicketCount().
    uint256 public constant MAX_TICKETS_PER_CASE = 10;

    /// @dev Referral splits are 1e18-scaled and must sum to exactly 1e18. The `Bps` in the
    ///      parameter name is a misnomer in Megapot's own ABI, basis points would be 10_000
    ///      and the call would silently mis-split. This is the single easiest thing to get
    ///      wrong in a Megapot integration.
    uint256 public constant FULL_REFERRAL_SPLIT = 1e18;

    /// @dev Tags our volume in Megapot's attribution data.
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant SOURCE = bytes32("mentalist");

    // ─────────────────────────────────────────── state

    Mentalist public immutable game;
    IJackpotRandomTicketBuyer public immutable ticketBuyer;
    IJackpot public immutable jackpot;
    IERC20 public immutable usdc;

    /// @dev Extra tickets granted at streak milestones, the reason a wrong accusation hurts.
    uint256 public streakBonusEvery = 3;
    uint256 public streakBonusTickets = 1;

    mapping(uint256 => bool) public rewarded;

    // ─────────────────────────────────────────── events

    event TicketsAwarded(
        uint256 indexed caseId,
        address indexed detective,
        uint256 count,
        uint256 cost,
        uint256 drawingId,
        uint256[] ticketIds
    );
    event ReferralFeesSwept(uint256 amount);
    event StreakBonusUpdated(uint256 every, uint256 tickets);

    // ─────────────────────────────────────────── errors

    error NotYourCase();
    error CaseNotSolved();
    error AlreadyRewarded();
    error NoTicketsEarned();
    error PurchasesDisabled();
    error TreasuryEmpty(uint256 needed, uint256 available);
    error BuyerMisconfigured();

    constructor(
        Mentalist _game,
        IJackpotRandomTicketBuyer _ticketBuyer,
        address _owner
    ) Ownable(_owner) {
        game = _game;
        ticketBuyer = _ticketBuyer;

        // Derive the jackpot and the ticket token from the buyer itself rather than
        // hardcoding them. Megapot runs different token addresses per network (and a
        // legacy testnet deployment on a mock token), so reading them at construction is
        // the only way to be certain we approve the right ERC20 for the right jackpot.
        address jp = _ticketBuyer.jackpot();
        address token = _ticketBuyer.usdc();
        if (jp == address(0) || token == address(0)) revert BuyerMisconfigured();

        jackpot = IJackpot(jp);
        usdc = IERC20(token);
    }

    // ─────────────────────────────────────────── the reward

    /// @notice How many tickets closing `caseId` is worth. Pure read, safe to render.
    function ticketsEarned(uint256 caseId) public view returns (uint256) {
        Mentalist.Case memory c = game.getCase(caseId);
        if (c.status != Mentalist.Status.Closed || !c.solved) return 0;

        uint256 count = c.focusLeft;

        // A streak milestone pays a bonus, so a wrong accusation costs more than the case
        // it lost, it resets the multiplier on every case after it.
        uint32 streak = game.streak(c.detective);
        if (streakBonusEvery != 0 && streak != 0 && streak % streakBonusEvery == 0) {
            count += streakBonusTickets;
        }

        return count > MAX_TICKETS_PER_CASE ? MAX_TICKETS_PER_CASE : count;
    }

    /// @notice Convert a solved case's surplus Focus into real Megapot tickets, minted to
    ///         the detective's own wallet and paid for out of this treasury.
    function claimTickets(uint256 caseId) external nonReentrant returns (uint256[] memory ticketIds) {
        Mentalist.Case memory c = game.getCase(caseId);
        if (c.detective != msg.sender) revert NotYourCase();
        if (c.status != Mentalist.Status.Closed || !c.solved) revert CaseNotSolved();
        if (rewarded[caseId]) revert AlreadyRewarded();

        uint256 count = ticketsEarned(caseId);
        if (count == 0) revert NoTicketsEarned();
        if (!jackpot.allowTicketPurchases()) revert PurchasesDisabled();

        rewarded[caseId] = true;

        // Price is read live, never assumed: it is 1.00 USDC on Base mainnet and 0.01 on
        // Base Sepolia, and Megapot can change it.
        uint256 cost = jackpot.ticketPrice() * count;
        uint256 available = usdc.balanceOf(address(this));
        if (available < cost) revert TreasuryEmpty(cost, available);

        // The buyer pulls USDC from us, so it, not the Jackpot, is the approval target.
        usdc.forceApprove(address(ticketBuyer), cost);

        address[] memory referrers = new address[](1);
        uint256[] memory split = new uint256[](1);
        referrers[0] = address(this);
        split[0] = FULL_REFERRAL_SPLIT;

        ticketIds = ticketBuyer.buyTickets(count, msg.sender, referrers, split, SOURCE);

        usdc.forceApprove(address(ticketBuyer), 0);

        emit TicketsAwarded(caseId, msg.sender, count, cost, jackpot.currentDrawingId(), ticketIds);
    }

    // ─────────────────────────────────────────── treasury

    /// @notice Sweep accrued Megapot referral fees back into the reward treasury.
    /// @dev Permissionless on purpose, anyone may refill the pot that pays other players,
    ///      and the funds land here regardless of who pays the gas.
    function sweepReferralFees() external {
        uint256 before = usdc.balanceOf(address(this));
        jackpot.claimReferralFees();
        emit ReferralFeesSwept(usdc.balanceOf(address(this)) - before);
    }

    /// @notice Referral fees waiting to be swept.
    function pendingReferralFees() external view returns (uint256) {
        return jackpot.referralFees(address(this));
    }

    /// @notice Tickets this treasury can still fund at the current price.
    function fundedTicketsRemaining() external view returns (uint256) {
        uint256 price = jackpot.ticketPrice();
        if (price == 0) return 0;
        return usdc.balanceOf(address(this)) / price;
    }

    function setStreakBonus(uint256 every, uint256 tickets) external onlyOwner {
        streakBonusEvery = every;
        streakBonusTickets = tickets;
        emit StreakBonusUpdated(every, tickets);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        usdc.safeTransfer(to, amount);
    }
}
