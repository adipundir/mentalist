// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Mentalist } from "./Mentalist.sol";
import { IJackpot, IJackpotRandomTicketBuyer } from "./CaseRewards.sol";

/**
 * @title  CaseMarket: a pari-mutuel pool on a secret nobody can read
 *
 * @notice Seven cases, each its own round with its own pot.
 *
 *         You stake USDC to enter a round. That opens a case whose culprit is sealed inside
 *         Inco's enclave, and starts a clock. Name him before the clock runs out and you are
 *         a winner; miss, or run out of time, and your stake stays in the pot. When the round
 *         closes, **the winners split the entire pot in proportion to what they staked**: *         so conviction is rewarded twice over, once for being right and once for how much
 *         you were willing to put behind it.
 *
 *         Winnings are paid in **Megapot tickets**, never in cash. Reading a room correctly
 *         buys you real lottery entries; the stakes of everyone who was wrong buy them for
 *         you. Megapot is the rail the whole economy settles on.
 *
 *         **One entry per wallet per round.** You get one read of each room. If you want
 *         another go, there is another case.
 *
 * @dev    Why a pari-mutuel pool rather than fixed odds: fixed odds need a bookmaker with a
 *         balance sheet, and any multiplier this contract set would be a number I invented.
 *         A pool sets its own price, the payout is whatever the losers funded, divided by
 *         conviction, and it can never be insolvent, because it only ever pays out what it
 *         already holds.
 *
 *         `Mentalist` is untouched by this and knows nothing about money: the market only
 *         *reads* case state. The game is fully playable with no stake at all.
 */
contract CaseMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────── tuning

    /// @notice How long a player has to crack their case once they've entered.
    uint64 public playWindow = 20 minutes;

    /// @notice How long a round accepts new entries.
    uint64 public roundLength = 7 days;

    uint256 public minStake = 100_000; // 0.10 USDC
    uint256 public maxStake = 5_000_000; // 5.00 USDC

    /// @dev Megapot's quick-pick buyer rejects counts outside 1..10, so a large share is
    ///      bought in batches. Bounded so a claim can never run out of gas.
    uint256 public constant TICKETS_PER_BATCH = 10;
    uint256 public constant MAX_BATCHES = 10;
    uint256 public constant FULL_REFERRAL_SPLIT = 1e18;
    bytes32 public constant SOURCE = bytes32("mentalist");

    // ─────────────────────────────────────────── types

    /// @dev The lineup a round demands. Checked on entry so nobody can walk in with a
    ///      four-man case and take the pot off people who played the twelve-man one.
    struct Spec {
        uint8 suspects;
        uint8 liars;
        uint8 questions;
        uint8 turnAt;
        bool set;
    }

    struct Round {
        uint64 closesAt;
        /// @dev Everything staked into this round. The pot the winners divide.
        uint128 pot;
        /// @dev Sum of the stakes of everyone who solved in time, the denominator of every
        ///      share. Grows until the last player reports in.
        uint128 winningStake;
        uint32 entrants;
        uint32 winners;
        /// @dev Once true, no more results may be recorded and claims are open.
        bool sealed_;
    }

    struct Entry {
        uint128 stake;
        uint256 caseId;
        uint64 deadline;
        bool recorded;
        bool won;
        bool claimed;
    }

    // ─────────────────────────────────────────── state

    Mentalist public immutable game;
    IJackpotRandomTicketBuyer public immutable ticketBuyer;
    IJackpot public immutable jackpot;
    IERC20 public immutable usdc;

    mapping(uint8 => Round) public rounds;
    mapping(uint8 => Spec) public specs;
    mapping(uint8 => mapping(address => Entry)) public entries;

    /// @dev Everything owed to open rounds. The owner can never withdraw it.
    uint256 public reserved;

    // ─────────────────────────────────────────── events

    event RoundOpened(uint8 indexed caseIndex, uint64 closesAt);
    event Entered(
        uint8 indexed caseIndex,
        address indexed player,
        uint256 caseId,
        uint256 stake,
        uint64 deadline,
        uint128 pot
    );
    event Result(uint8 indexed caseIndex, address indexed player, bool won, bool inTime);
    event RoundSealed(uint8 indexed caseIndex, uint128 pot, uint128 winningStake, uint32 winners);
    event Claimed(uint8 indexed caseIndex, address indexed player, uint256 share, uint256 tickets, uint256[] ticketIds);
    event Refunded(uint8 indexed caseIndex, address indexed player, uint256 amount);

    // ─────────────────────────────────────────── errors

    error RoundClosed();
    error SpecNotSet();
    error WrongCase();
    error CaseAlreadyPlayed();
    error NotYourCase();
    error CaseNotOpen();
    error RoundNotClosed();
    error RoundNotSealed();
    error AlreadySealed();
    error AlreadyEntered();
    error NoEntry();
    error AlreadyRecorded();
    error AlreadyClaimed();
    error NotAWinner();
    error StakeOutOfRange(uint256 min, uint256 max);
    error CaseNotClosed();
    error PurchasesDisabled();
    error NothingToPay();

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

    // ─────────────────────────────────────────── rounds

    /// @notice Fix the lineup a round requires, and open it for entries.
    function configureRound(
        uint8 caseIndex,
        uint8 suspects,
        uint8 liars,
        uint8 questions,
        uint8 turnAt
    ) external onlyOwner {
        specs[caseIndex] = Spec(suspects, liars, questions, turnAt, true);
        Round storage r = rounds[caseIndex];
        if (r.closesAt == 0) {
            r.closesAt = uint64(block.timestamp) + roundLength;
            emit RoundOpened(caseIndex, r.closesAt);
        }
    }

    /**
     * @notice Enter a round: stake on a case you have just opened, and start the clock.
     *
     * @dev Open the case on `Mentalist` first, then hand the id here. The case must be yours,
     *      untouched, and match this round's spec, otherwise a player could enter with an
     *      easy four-man lineup and take the pot off people who played the real one.
     */
    function enter(uint8 caseIndex, uint256 caseId, uint256 stake) external nonReentrant {
        Round storage r = rounds[caseIndex];
        Spec memory spec = specs[caseIndex];
        if (!spec.set) revert SpecNotSet();
        if (r.sealed_ || block.timestamp >= r.closesAt) revert RoundClosed();
        if (entries[caseIndex][msg.sender].stake != 0) revert AlreadyEntered();
        if (stake < minStake || stake > maxStake) revert StakeOutOfRange(minStake, maxStake);

        // The player opens their own case directly on Mentalist, which keeps this contract
        // out of the confidential path entirely: every answer is granted to the detective
        // and nobody else, including here. All the market does is check the case is theirs,
        // untouched, and the lineup this round actually calls for.
        Mentalist.Case memory c = game.getCase(caseId);
        if (c.detective != msg.sender) revert NotYourCase();
        if (c.status != Mentalist.Status.Open) revert CaseNotOpen();
        if (c.questionsAsked != 0) revert CaseAlreadyPlayed();
        if (
            c.suspects != spec.suspects ||
            c.liars != spec.liars ||
            c.turnAt != spec.turnAt ||
            c.focusLeft != spec.questions
        ) revert WrongCase();

        usdc.safeTransferFrom(msg.sender, address(this), stake);

        entries[caseIndex][msg.sender] = Entry({
            stake: uint128(stake),
            caseId: caseId,
            deadline: uint64(block.timestamp) + playWindow,
            recorded: false,
            won: false,
            claimed: false
        });

        r.pot += uint128(stake);
        r.entrants += 1;
        reserved += stake;

        emit Entered(caseIndex, msg.sender, caseId, stake, uint64(block.timestamp) + playWindow, r.pot);
    }

    /**
     * @notice Report your result. Only a case the *contract* has ruled solved counts, and
     *         only if you closed it before your clock ran out.
     *
     * @dev `solved` on Mentalist only becomes true after it has verified a covalidator
     *      attestation over the accused seat's encrypted guilt bit, so the pool settles
     *      against Inco's enclave, not against anything a player or this contract could
     *      assert.
     */
    function recordResult(uint8 caseIndex) external nonReentrant {
        Entry storage e = entries[caseIndex][msg.sender];
        if (e.stake == 0) revert NoEntry();
        if (e.recorded) revert AlreadyRecorded();

        Mentalist.Case memory c = game.getCase(e.caseId);
        if (c.status != Mentalist.Status.Closed) revert CaseNotClosed();

        bool inTime = uint64(block.timestamp) <= e.deadline;
        bool won = c.solved && inTime;

        e.recorded = true;
        e.won = won;

        if (won) {
            Round storage r = rounds[caseIndex];
            r.winningStake += e.stake;
            r.winners += 1;
        }

        emit Result(caseIndex, msg.sender, won, inTime);
    }

    /// @notice Close a round for good once entries have stopped. Permissionless.
    function sealRound(uint8 caseIndex) public {
        Round storage r = rounds[caseIndex];
        if (r.closesAt == 0 || block.timestamp < r.closesAt + playWindow) revert RoundNotClosed();
        if (r.sealed_) revert AlreadySealed();
        r.sealed_ = true;
        emit RoundSealed(caseIndex, r.pot, r.winningStake, r.winners);
    }

    // ─────────────────────────────────────────── payout

    /// @notice Your share of the pot: the whole pot, split by stake among those who solved it.
    function shareOf(uint8 caseIndex, address player) public view returns (uint256) {
        Round memory r = rounds[caseIndex];
        Entry memory e = entries[caseIndex][player];
        if (!e.won || r.winningStake == 0) return 0;
        return (uint256(r.pot) * e.stake) / r.winningStake;
    }

    /**
     * @notice Collect your share, paid in Megapot tickets.
     *
     * @dev Tickets rather than cash on purpose: the reward for reading a room is a real
     *      lottery entry, funded by everyone who read it wrong. Any remainder below one
     *      ticket is left in the contract rather than dust-transferred.
     */
    function claim(uint8 caseIndex) external nonReentrant returns (uint256[] memory ticketIds) {
        Round storage r = rounds[caseIndex];
        if (!r.sealed_) revert RoundNotSealed();

        Entry storage e = entries[caseIndex][msg.sender];
        if (e.stake == 0) revert NoEntry();
        if (e.claimed) revert AlreadyClaimed();
        if (!e.won) revert NotAWinner();

        uint256 share = shareOf(caseIndex, msg.sender);
        if (share == 0) revert NothingToPay();

        e.claimed = true;
        // Decrement by the *share*, not the stake: a winner leaves with the losers' money too,
        // and reserving only what they put in would leave their winnings permanently locked.
        reserved -= share;

        if (!jackpot.allowTicketPurchases()) revert PurchasesDisabled();

        uint256 price = jackpot.ticketPrice();
        uint256 count = share / price;
        if (count > TICKETS_PER_BATCH * MAX_BATCHES) count = TICKETS_PER_BATCH * MAX_BATCHES;

        uint256 cost = price * count;
        if (cost != 0) {
            usdc.forceApprove(address(ticketBuyer), cost);

            address[] memory referrers = new address[](1);
            uint256[] memory split = new uint256[](1);
            referrers[0] = address(this);
            split[0] = FULL_REFERRAL_SPLIT;

            ticketIds = new uint256[](count);
            uint256 filled;
            while (filled < count) {
                uint256 batch = count - filled;
                if (batch > TICKETS_PER_BATCH) batch = TICKETS_PER_BATCH;
                uint256[] memory got = ticketBuyer.buyTickets(batch, msg.sender, referrers, split, SOURCE);
                for (uint256 i; i < got.length; ++i) ticketIds[filled + i] = got[i];
                filled += batch;
            }
            usdc.forceApprove(address(ticketBuyer), 0);
        } else {
            ticketIds = new uint256[](0);
        }

        // Whatever a whole ticket wouldn't buy goes back to the player rather than to the
        // house. Silently keeping it would make the contract the beneficiary of rounding.
        uint256 dust = share - cost;
        if (dust != 0) usdc.safeTransfer(msg.sender, dust);

        emit Claimed(caseIndex, msg.sender, share, count, ticketIds);
    }

    /**
     * @notice If a round sealed with nobody solving it, entrants get their stake back.
     * @dev A pot with no winners has no one to divide it among, and keeping it would make
     *      the house the beneficiary of everybody's failure.
     */
    function refund(uint8 caseIndex) external nonReentrant {
        Round storage r = rounds[caseIndex];
        if (!r.sealed_) revert RoundNotSealed();
        if (r.winningStake != 0) revert NotAWinner();

        Entry storage e = entries[caseIndex][msg.sender];
        if (e.stake == 0) revert NoEntry();
        if (e.claimed) revert AlreadyClaimed();

        e.claimed = true;
        reserved -= e.stake;
        usdc.safeTransfer(msg.sender, e.stake);

        emit Refunded(caseIndex, msg.sender, e.stake);
    }

    // ─────────────────────────────────────────── views

    /// @notice Seconds left on this player's clock, or zero if it has run out.
    function timeLeft(uint8 caseIndex, address player) external view returns (uint256) {
        Entry memory e = entries[caseIndex][player];
        if (e.stake == 0 || block.timestamp >= e.deadline) return 0;
        return e.deadline - block.timestamp;
    }

    function hasPlayed(uint8 caseIndex, address player) external view returns (bool) {
        return entries[caseIndex][player].stake != 0;
    }

    // ─────────────────────────────────────────── admin

    function sweepReferralFees() external {
        jackpot.claimReferralFees();
    }

    function setWindows(uint64 play, uint64 round) external onlyOwner {
        require(play >= 3 minutes && round >= 1 hours, "too short");
        playWindow = play;
        roundLength = round;
    }

    function setStakeRange(uint256 min, uint256 max) external onlyOwner {
        require(min > 0 && max >= min, "bad range");
        minStake = min;
        maxStake = max;
    }

    /// @dev Only ever the referral fees and rounding dust, never staked funds.
    function withdrawSurplus(address to) external onlyOwner {
        uint256 bal = usdc.balanceOf(address(this));
        require(bal > reserved, "nothing spare");
        usdc.safeTransfer(to, bal - reserved);
    }
}
