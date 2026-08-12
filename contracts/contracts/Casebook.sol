// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { e, ebool, euint256, inco } from "@inco/lightning/src/Lib.sol";
import { DecryptionAttestation } from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import { asBool } from "@inco/lightning/src/shared/TypeUtils.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IJackpot, IJackpotRandomTicketBuyer } from "./CaseRewards.sol";

/**
 * @title  Casebook: a prediction market on a name nobody can read
 *
 * @notice Red John is one of the people in every case, and the market is a bet on which.
 *
 *         **Nothing about the answer is written down in the clear, anywhere.** When a case
 *         is opened, whoever writes it encrypts Red John's person id on their own machine
 *         and hands over a ciphertext. That is what this contract stores. It is not in the
 *         repository, not in the calldata, not in the logs, and not readable by the account
 *         that put it there.
 *
 *         **Nor is anybody's bet.** A player stakes USDC together with an encrypted person
 *         id of their own. The contract compares the two inside Inco's enclave and keeps the
 *         encrypted verdict, so a spectator watching the chain cannot see who anyone backed,
 *         and cannot follow whoever seems to know what they are doing.
 *
 *         When the case closes, each player files a covalidator attestation over their own
 *         verdict bit. Everyone who named the right person splits the whole pot in
 *         proportion to what they staked, paid out as real Megapot tickets bought with the
 *         money of everyone who named the wrong one.
 *
 * @dev    Why this contract holds the answer rather than dealing one.
 *
 *         An earlier design dealt a different culprit to every player inside the enclave.
 *         That is a fine puzzle and a bad market: if we are all solving different problems
 *         then a shared pot is a pool of unrelated bets, and "the odds" mean nothing. A
 *         market needs one question. So the answer is authored once, encrypted once, and
 *         everyone is betting on the same name.
 *
 *         Which puts the whole weight of the design on confidential compute. There is no
 *         commit-reveal here that would work: the operator would have to hold the answer
 *         until settlement and could change it, and a hash commitment of a person id in a
 *         known small range is brute-forced in microseconds. The answer has to be *usable*
 *         while still secret, because the contract has to compare against it, and that is
 *         precisely what a TEE gives and a hash does not.
 */
contract Casebook is Ownable, ReentrancyGuard {
    using e for *;
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────── types

    struct Case {
        /** Unix seconds this case stops accepting money. */
        uint64 closesAt;
        /** How many people are in the room. Person ids run 0..suspects-1. */
        uint8 suspects;
        /** Everything staked. The pot the winners divide. */
        uint128 pot;
        /** Sum of the stakes of everyone who named the right person. The share denominator. */
        uint128 winningStake;
        uint32 entrants;
        uint32 winners;
        /** Once true, no more verdicts may be filed and payouts are open. */
        bool settled;
        bool exists;
    }

    struct Bet {
        uint128 stake;
        /** Filed a verdict already. */
        bool resolved;
        bool won;
        bool paid;
    }

    // ─────────────────────────────────────────── state

    IJackpotRandomTicketBuyer public immutable ticketBuyer;
    IJackpot public immutable jackpot;
    IERC20 public immutable usdc;

    mapping(uint16 => Case) public cases;
    mapping(uint16 => mapping(address => Bet)) public bets;

    /// @dev Red John's person id, per case. Encrypted at rest and never revealed by this
    ///      contract, not even after settlement: the same case can run again.
    mapping(uint16 => euint256) internal _answer;
    /// @dev Whether a given player named him. Encrypted, and readable only by that player.
    mapping(uint16 => mapping(address => ebool)) internal _correct;
    /// @dev The handle each player must file an attestation over.
    mapping(uint16 => mapping(address => bytes32)) public verdictHandle;

    /// @dev Everything owed to open cases. The owner can never withdraw it.
    uint256 public reserved;

    uint256 public minStake = 100_000; // 0.10 USDC
    uint256 public maxStake = 5_000_000; // 5.00 USDC

    /// @dev Megapot's quick-pick buyer rejects counts outside 1..10, so a large share batches.
    uint256 public constant TICKETS_PER_BATCH = 10;
    uint256 public constant MAX_BATCHES = 10;
    uint256 public constant FULL_REFERRAL_SPLIT = 1e18;
    bytes32 public constant SOURCE = bytes32("mentalist");

    // ─────────────────────────────────────────── events

    event CaseOpened(uint16 indexed caseId, uint8 suspects, uint64 closesAt);
    /// @dev No person id here, in either direction. That is the point of the whole contract.
    event Staked(uint16 indexed caseId, address indexed player, uint256 amount, uint128 pot);
    event Resolved(uint16 indexed caseId, address indexed player, bool won);
    event Settled(uint16 indexed caseId, uint128 pot, uint128 winningStake, uint32 winners);
    event PaidOut(uint16 indexed caseId, address indexed player, uint256 share, uint256[] ticketIds);
    event Refunded(uint16 indexed caseId, address indexed player, uint256 amount);

    // ─────────────────────────────────────────── errors

    error NoSuchCase();
    error CaseExists();
    error CaseClosed();
    error CaseStillOpen();
    error AlreadySettled();
    error NotSettled();
    error AlreadyStaked();
    error NothingStaked();
    error AlreadyResolved();
    error NotResolved();
    error AlreadyPaid();
    error DidNotWin();
    error StakeOutOfRange(uint256 min, uint256 max);
    error FeeTooLow();
    error HandleMismatch();
    error InvalidAttestation();
    error BadConfig();
    error PurchasesDisabled();

    constructor(IJackpotRandomTicketBuyer _ticketBuyer, address _owner) Ownable(_owner) {
        ticketBuyer = _ticketBuyer;
        jackpot = IJackpot(_ticketBuyer.jackpot());
        usdc = IERC20(_ticketBuyer.usdc());
    }

    // ─────────────────────────────────────────── writing a case

    /**
     * @notice Open a case, and tell the contract who did it without telling anyone else.
     *
     * @param caseId          which case this is, matching the casebook in the frontend
     * @param suspects        how many people are in the room
     * @param encryptedAnswer Red John's person id, encrypted on the author's machine
     * @param openFor         how long the case takes money, in seconds
     *
     * @dev The answer arrives as a ciphertext and is ingested straight into an `euint256`.
     *      It is never compared, logged or stored in the clear at any point, so the account
     *      that opened the case cannot read it back off the chain afterwards either.
     *
     *      Ingesting a ciphertext costs an Inco fee, which is why this is payable.
     */
    function openCase(
        uint16 caseId,
        uint8 suspects,
        bytes calldata encryptedAnswer,
        uint64 openFor
    ) external payable onlyOwner {
        if (cases[caseId].exists) revert CaseExists();
        if (suspects < 2 || openFor < 1 hours) revert BadConfig();
        if (msg.value < inco.getFee()) revert FeeTooLow();

        euint256 answer = encryptedAnswer.newEuint256(msg.sender);
        e.allowThis(answer); // mandatory: without it the case is unusable next transaction
        _answer[caseId] = answer;

        uint64 closesAt = uint64(block.timestamp) + openFor;
        cases[caseId] = Case({
            closesAt: closesAt,
            suspects: suspects,
            pot: 0,
            winningStake: 0,
            entrants: 0,
            winners: 0,
            settled: false,
            exists: true
        });

        emit CaseOpened(caseId, suspects, closesAt);
    }

    // ─────────────────────────────────────────── betting

    /**
     * @notice Put money on a name, without saying the name out loud.
     *
     * @param caseId       the case
     * @param encryptedBet the person id you are backing, encrypted on your machine
     * @param amount       your stake, in USDC
     *
     * @dev The comparison happens here rather than at settlement so the verdict exists the
     *      moment the bet does, and neither the bet nor the answer ever has to be moved or
     *      re-ingested. `_correct` is granted to the player alone: they are the only account
     *      that can decrypt whether they were right, and they cannot do it early because the
     *      attestation is only accepted once the case has closed.
     */
    function stake(
        uint16 caseId,
        bytes calldata encryptedBet,
        uint256 amount
    ) external payable nonReentrant {
        Case storage c = cases[caseId];
        if (!c.exists) revert NoSuchCase();
        if (block.timestamp >= c.closesAt || c.settled) revert CaseClosed();
        if (bets[caseId][msg.sender].stake != 0) revert AlreadyStaked();
        if (amount < minStake || amount > maxStake) revert StakeOutOfRange(minStake, maxStake);
        if (msg.value < inco.getFee()) revert FeeTooLow();

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        euint256 named = encryptedBet.newEuint256(msg.sender);
        ebool right = e.eq(named, _answer[caseId]);
        e.allow(right, msg.sender); // selective reveal: this player, and nobody else
        e.allowThis(right);

        _correct[caseId][msg.sender] = right;
        verdictHandle[caseId][msg.sender] = ebool.unwrap(right);

        bets[caseId][msg.sender] = Bet({ stake: uint128(amount), resolved: false, won: false, paid: false });

        c.pot += uint128(amount);
        c.entrants += 1;
        reserved += amount;

        emit Staked(caseId, msg.sender, amount, c.pot);
    }

    // ─────────────────────────────────────────── the result

    /**
     * @notice File your result once the case has closed.
     *
     * @dev Model A settlement: the *contract* rules, by verifying a covalidator attestation
     *      over this player's own verdict bit and checking the handle is the one it stored.
     *      A market that took the client's word for who won would be a scoreboard.
     *
     *      Only after `closesAt`, so nobody can learn the answer while money is still moving
     *      and simply tell everyone.
     */
    function resolve(
        uint16 caseId,
        DecryptionAttestation calldata attestation,
        bytes[] calldata signatures
    ) external {
        Case storage c = cases[caseId];
        if (!c.exists) revert NoSuchCase();
        if (block.timestamp < c.closesAt) revert CaseStillOpen();
        if (c.settled) revert AlreadySettled();

        Bet storage b = bets[caseId][msg.sender];
        if (b.stake == 0) revert NothingStaked();
        if (b.resolved) revert AlreadyResolved();

        if (attestation.handle != verdictHandle[caseId][msg.sender]) revert HandleMismatch();
        if (!inco.incoVerifier().isValidDecryptionAttestation(attestation, signatures)) {
            revert InvalidAttestation();
        }

        bool won = asBool(attestation.value);
        b.resolved = true;
        b.won = won;

        if (won) {
            c.winningStake += b.stake;
            c.winners += 1;
        }

        emit Resolved(caseId, msg.sender, won);
    }

    /**
     * @notice Close the books. Permissionless, once everyone has had time to file.
     * @dev A grace window after `closesAt` so a slow filer is not cut out of their own win.
     */
    function settle(uint16 caseId) external {
        Case storage c = cases[caseId];
        if (!c.exists) revert NoSuchCase();
        if (block.timestamp < c.closesAt + 1 hours) revert CaseStillOpen();
        if (c.settled) revert AlreadySettled();

        c.settled = true;
        emit Settled(caseId, c.pot, c.winningStake, c.winners);
    }

    // ─────────────────────────────────────────── payout

    /// @notice Your share: the whole pot, split by stake among everyone who named him.
    function shareOf(uint16 caseId, address player) public view returns (uint256) {
        Case memory c = cases[caseId];
        Bet memory b = bets[caseId][player];
        if (!b.won || c.winningStake == 0) return 0;
        return (uint256(c.pot) * b.stake) / c.winningStake;
    }

    /**
     * @notice Collect, in Megapot tickets.
     *
     * @dev Tickets rather than cash on purpose: reading a room correctly buys real lottery
     *      entries, and the stakes of everyone who read it wrong are what buy them. Whatever
     *      a whole ticket will not buy goes back as USDC rather than being kept.
     */
    function payout(uint16 caseId) external nonReentrant returns (uint256[] memory ticketIds) {
        Case storage c = cases[caseId];
        if (!c.settled) revert NotSettled();

        Bet storage b = bets[caseId][msg.sender];
        if (b.stake == 0) revert NothingStaked();
        if (!b.resolved) revert NotResolved();
        if (b.paid) revert AlreadyPaid();
        if (!b.won) revert DidNotWin();

        uint256 share = shareOf(caseId, msg.sender);
        b.paid = true;
        // By the share, not the stake: a winner leaves with the losers' money too, and
        // reserving only what they put in would lock their winnings in here forever.
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

        uint256 dust = share - cost;
        if (dust != 0) usdc.safeTransfer(msg.sender, dust);

        emit PaidOut(caseId, msg.sender, share, ticketIds);
    }

    /**
     * @notice If nobody named him, everyone gets their stake back.
     * @dev A pot with no winners has nobody to divide it among, and keeping it would make
     *      the house the beneficiary of everybody's failure.
     */
    function refund(uint16 caseId) external nonReentrant {
        Case storage c = cases[caseId];
        if (!c.settled) revert NotSettled();
        if (c.winningStake != 0) revert DidNotWin();

        Bet storage b = bets[caseId][msg.sender];
        if (b.stake == 0) revert NothingStaked();
        if (b.paid) revert AlreadyPaid();

        b.paid = true;
        reserved -= b.stake;
        usdc.safeTransfer(msg.sender, b.stake);

        emit Refunded(caseId, msg.sender, b.stake);
    }

    // ─────────────────────────────────────────── views

    /// @notice What it costs to open a case or place a bet: one ciphertext ingest.
    function quoteFee() external view returns (uint256) {
        return inco.getFee() * 2;
    }

    function timeLeft(uint16 caseId) external view returns (uint256) {
        Case memory c = cases[caseId];
        if (!c.exists || block.timestamp >= c.closesAt) return 0;
        return c.closesAt - block.timestamp;
    }

    function hasStaked(uint16 caseId, address player) external view returns (bool) {
        return bets[caseId][player].stake != 0;
    }

    // ─────────────────────────────────────────── admin

    function sweepReferralFees() external {
        jackpot.claimReferralFees();
    }

    function setStakeRange(uint256 min, uint256 max) external onlyOwner {
        if (min == 0 || max < min) revert BadConfig();
        minStake = min;
        maxStake = max;
    }

    /// @dev Only ever referral fees and rounding dust. Never staked funds.
    function withdrawSurplus(address to) external onlyOwner {
        uint256 bal = usdc.balanceOf(address(this));
        if (bal <= reserved) revert BadConfig();
        usdc.safeTransfer(to, bal - reserved);
    }
}
