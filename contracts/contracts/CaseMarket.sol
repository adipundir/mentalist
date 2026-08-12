// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Mentalist } from "./Mentalist.sol";
import { IJackpot, IJackpotRandomTicketBuyer } from "./CaseRewards.sol";

/**
 * @title  CaseMarket — a prediction market on a secret
 *
 * @notice You back a suspect with USDC before the contract will tell you anything, and the
 *         odds shorten with every question you buy.
 *
 *         This is a prediction market whose outcome is not a future event but a *fact that
 *         already exists and cannot be read*. Red John's identity is sealed inside Inco's
 *         enclave at deal time — no oracle to front-run, no news to trade on, no operator
 *         who knows the answer. The only edge available is deduction, which is the entire
 *         point of the game sitting on top of it.
 *
 *         **The tension.** Payout decays as `suspects / (questions + 1)`. Name him blind on
 *         a nine-man lineup and it pays 7.6×; spend four questions first and it pays 1.5×.
 *         Every question makes you safer and poorer, so every turn is a real decision rather
 *         than a free click.
 *
 *         **Winnings are paid in Megapot tickets, never in cash.** A correct call buys you
 *         real lottery entries — so the reward for reading a room is a shot at a jackpot,
 *         and the stake you lose funds the next player's. Megapot is the rail the whole
 *         economy runs on; remove it and there is nothing to win.
 *
 * @dev    Deliberately separate from `Mentalist`, which stays a pure game and knows nothing
 *         about money. This contract only *reads* case state, so the game can be played
 *         with no stake at all and the market is opt-in.
 */
contract CaseMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────── tuning

    /// @dev Basis points kept by the house. The odds are otherwise generous relative to
    ///      what a good player can actually narrow the field to, so this is what keeps the
    ///      treasury solvent across many cases rather than a profit motive.
    uint256 public houseEdgeBps = 1_500; // 15%

    /// @dev Payout can never be worse than breaking even, or a late correct call would
    ///      punish the player for being careful.
    uint256 public constant MIN_MULTIPLIER_BPS = 10_500; // 1.05x

    uint256 public minStake = 100_000; // 0.10 USDC
    uint256 public maxStake = 2_000_000; // 2.00 USDC

    /// @dev Megapot's quick-pick buyer rejects counts outside 1..10.
    uint256 public constant MAX_TICKETS_PER_WIN = 10;

    uint256 public constant FULL_REFERRAL_SPLIT = 1e18;
    bytes32 public constant SOURCE = bytes32("mentalist");

    // ─────────────────────────────────────────── state

    Mentalist public immutable game;
    IJackpotRandomTicketBuyer public immutable ticketBuyer;
    IJackpot public immutable jackpot;
    IERC20 public immutable usdc;

    struct Position {
        address player;
        uint128 stake;
        uint8 suspect;
        bool settled;
        bool won;
        /// @dev The multiplier is fixed at settlement, not at stake time — the whole point
        ///      is that it moves while you play.
        uint32 paidBps;
    }

    mapping(uint256 => Position) public positions;

    /// @dev Stake held against unsettled positions. Never withdrawable by the owner.
    uint256 public lockedStake;

    // ─────────────────────────────────────────── events

    event Backed(uint256 indexed caseId, address indexed player, uint8 suspect, uint256 stake, uint256 openingOddsBps);
    event Settled(
        uint256 indexed caseId,
        address indexed player,
        bool won,
        uint256 multiplierBps,
        uint256 tickets,
        uint256[] ticketIds
    );

    // ─────────────────────────────────────────── errors

    error NotYourCase();
    error CaseNotOpen();
    error CaseNotClosed();
    error AlreadyBacked();
    error NothingAtStake();
    error AlreadySettled();
    error StakeOutOfRange(uint256 min, uint256 max);
    error BadSuspect();
    error TreasuryShort(uint256 needed, uint256 available);
    error PurchasesDisabled();

    constructor(
        Mentalist _game,
        IJackpotRandomTicketBuyer _ticketBuyer,
        address _owner
    ) Ownable(_owner) {
        game = _game;
        ticketBuyer = _ticketBuyer;
        jackpot = IJackpot(_ticketBuyer.jackpot());
        usdc = IERC20(_ticketBuyer.usdc());
    }

    // ─────────────────────────────────────────── odds

    /**
     * @notice What a correct call pays right now, in basis points.
     *
     * @dev `suspects / (questions + 1)`, less the house edge. A blind call on a nine-man
     *      lineup pays about 7.6×; four questions in, about 1.5×. The decay is deliberately
     *      gentler than the ~`N / 2^questions` a perfect binary search actually achieves,
     *      because the point is to price *impatience* rather than to be an exact bookmaker —
     *      and because a player who narrows the field faster than the odds decay is a player
     *      who has genuinely outplayed the market.
     */
    function multiplierBps(uint256 suspects, uint256 questionsAsked) public view returns (uint256) {
        uint256 raw = (suspects * 10_000) / (questionsAsked + 1);
        uint256 net = (raw * (10_000 - houseEdgeBps)) / 10_000;
        return net < MIN_MULTIPLIER_BPS ? MIN_MULTIPLIER_BPS : net;
    }

    /// @notice The odds a player is looking at for a live case.
    function currentOddsBps(uint256 caseId) external view returns (uint256) {
        Mentalist.Case memory c = game.getCase(caseId);
        return multiplierBps(c.suspects, c.questionsAsked);
    }

    /// @notice What this position would pay if the call lands right now.
    function projectedPayout(uint256 caseId) external view returns (uint256) {
        Position memory p = positions[caseId];
        if (p.stake == 0) return 0;
        Mentalist.Case memory c = game.getCase(caseId);
        return (uint256(p.stake) * multiplierBps(c.suspects, c.questionsAsked)) / 10_000;
    }

    // ─────────────────────────────────────────── backing a hunch

    /**
     * @notice Put money on a suspect. Must be done while the case is still open, and the
     *         odds you eventually get depend on how much you ask before calling it.
     * @dev The suspect named here is *not* binding — the accusation the contract settles
     *      against is the one made in `Mentalist.accuse`. This is the stake, not the guess.
     */
    function back(uint256 caseId, uint8 suspect, uint256 stake) external nonReentrant {
        Mentalist.Case memory c = game.getCase(caseId);
        if (c.detective != msg.sender) revert NotYourCase();
        if (c.status != Mentalist.Status.Open) revert CaseNotOpen();
        if (suspect >= c.suspects) revert BadSuspect();
        if (positions[caseId].stake != 0) revert AlreadyBacked();
        if (stake < minStake || stake > maxStake) revert StakeOutOfRange(minStake, maxStake);

        usdc.safeTransferFrom(msg.sender, address(this), stake);
        lockedStake += stake;

        positions[caseId] = Position({
            player: msg.sender,
            stake: uint128(stake),
            suspect: suspect,
            settled: false,
            won: false,
            paidBps: 0
        });

        emit Backed(caseId, msg.sender, suspect, stake, multiplierBps(c.suspects, c.questionsAsked));
    }

    /**
     * @notice Collect. A correct call buys Megapot tickets at the odds standing when the
     *         case closed; a wrong one forfeits the stake to the treasury.
     *
     * @dev Reads `solved` from `Mentalist`, which only becomes true once the *contract* has
     *      verified a covalidator attestation over the accused seat's encrypted guilt bit.
     *      So the market resolves against Inco's enclave, not against anything this contract
     *      or its owner could influence.
     */
    function settle(uint256 caseId) external nonReentrant returns (uint256[] memory ticketIds) {
        Position storage p = positions[caseId];
        if (p.stake == 0) revert NothingAtStake();
        if (p.settled) revert AlreadySettled();
        if (p.player != msg.sender) revert NotYourCase();

        Mentalist.Case memory c = game.getCase(caseId);
        if (c.status != Mentalist.Status.Closed) revert CaseNotClosed();

        p.settled = true;
        lockedStake -= p.stake;

        if (!c.solved) {
            // The stake stays and funds the next player's win.
            emit Settled(caseId, msg.sender, false, 0, 0, new uint256[](0));
            return new uint256[](0);
        }

        uint256 bps = multiplierBps(c.suspects, c.questionsAsked);
        uint256 payout = (uint256(p.stake) * bps) / 10_000;

        p.won = true;
        p.paidBps = uint32(bps);

        if (!jackpot.allowTicketPurchases()) revert PurchasesDisabled();

        uint256 price = jackpot.ticketPrice();
        uint256 count = payout / price;
        if (count == 0) count = 1;
        if (count > MAX_TICKETS_PER_WIN) count = MAX_TICKETS_PER_WIN;

        uint256 cost = price * count;
        uint256 available = usdc.balanceOf(address(this));
        if (available < cost) revert TreasuryShort(cost, available);

        usdc.forceApprove(address(ticketBuyer), cost);

        address[] memory referrers = new address[](1);
        uint256[] memory split = new uint256[](1);
        referrers[0] = address(this);
        split[0] = FULL_REFERRAL_SPLIT;

        ticketIds = ticketBuyer.buyTickets(count, msg.sender, referrers, split, SOURCE);
        usdc.forceApprove(address(ticketBuyer), 0);

        emit Settled(caseId, msg.sender, true, bps, count, ticketIds);
    }

    // ─────────────────────────────────────────── treasury

    /// @notice Sweep Megapot referral fees back in. Permissionless — anyone may refill the
    ///         pot that pays other players.
    function sweepReferralFees() external {
        jackpot.claimReferralFees();
    }

    function pendingReferralFees() external view returns (uint256) {
        return jackpot.referralFees(address(this));
    }

    /// @notice Treasury not spoken for by an open position.
    function freeBalance() public view returns (uint256) {
        uint256 bal = usdc.balanceOf(address(this));
        return bal > lockedStake ? bal - lockedStake : 0;
    }

    function setEdge(uint256 bps) external onlyOwner {
        require(bps <= 3_000, "edge too high");
        houseEdgeBps = bps;
    }

    function setStakeRange(uint256 min, uint256 max) external onlyOwner {
        require(min > 0 && max >= min, "bad range");
        minStake = min;
        maxStake = max;
    }

    /// @dev Cannot touch stake locked against unsettled positions.
    function withdraw(address to, uint256 amount) external onlyOwner {
        require(amount <= freeBalance(), "would raid open positions");
        usdc.safeTransfer(to, amount);
    }
}
