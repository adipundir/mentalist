// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { e, ebool, euint256, inco } from "@inco/lightning/src/Lib.sol";
import { DecryptionAttestation } from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import { asBool } from "@inco/lightning/src/shared/TypeUtils.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IBatchPurchaseFacilitator, IJackpot, IJackpotRandomTicketBuyer } from "./Megapot.sol";

/**
 * @title  Mentalist: a prediction market on a name nobody can read
 *
 * @notice Every case is its own murder with its own killer, and the market is a bet on which
 *         of the people in that room did it.
 *
 *         **The answer reaches the chain only as ciphertext.** When a case is opened,
 *         whoever writes it encrypts the killer's person id on their own machine and hands
 *         over a ciphertext. That is what this contract stores: not in the calldata, not in
 *         the logs, and not readable afterwards by the account that put it there. The alibis
 *         themselves are public content and ship in the repository
 *         (`frontend/lib/casebook.ts`), so a careful reader can work the puzzle out. What the
 *         ciphertext buys is that settlement is trustless in one exact sense: the answer is
 *         fixed before the first bet and the operator cannot change it afterwards. The owner
 *         may move the closing clock for testing and operations, but cannot rewrite the answer.
 *         It does not make the operator *correct*. Nothing on chain can check
 *         that the sealed id belongs to the person whose alibi is impossible, so an author
 *         who sealed the wrong name and staked on it would be indistinguishable from someone
 *         who guessed well. `openCase` says what is and is not enforced there.
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
contract Mentalist is Ownable, ReentrancyGuard {
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
        /** How many entrants have had a verdict recorded. Appended so the getter's existing
            positions do not move. */
        uint32 filed;
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

    /// @dev Megapot's bulk route, set by the owner because it is not derivable from the buyer
    ///      and is not published in the mainnet address table. Zero disables it and every
    ///      payout falls back to the immediate purchase below, so a wrong or missing address
    ///      costs tickets per call and never a winner's money.
    IBatchPurchaseFacilitator public batchFacilitator;
    IJackpot public immutable jackpot;
    IERC20 public immutable usdc;

    mapping(uint16 => Case) public cases;
    mapping(uint16 => mapping(address => Bet)) public bets;
    /// @dev The wallets that staked in each case. The keeper reads this list directly from
    /// contract storage; settlement does not depend on an explorer or event-log indexer.
    mapping(uint16 => address[]) private _players;

    /// @dev The killer's person id, per case. Encrypted at rest and never revealed by this
    ///      contract, not even after settlement: the same case can run again.
    mapping(uint16 => euint256) internal _answer;
    /// @dev Whether a given player named him. Encrypted, and readable only by that player.
    mapping(uint16 => mapping(address => ebool)) internal _correct;
    /// @dev The handle each player must file an attestation over.
    mapping(uint16 => mapping(address => bytes32)) public verdictHandle;

    /// @dev How much winning stake had already been filed when this winner filed. It is what
    ///      lets the pot divide exactly rather than by a floor per winner, so nothing is left
    ///      behind in `reserved`. See `shareOf`.
    mapping(uint16 => mapping(address => uint128)) internal _winningStakeBefore;

    /// @dev Everything owed to open cases. The owner can never withdraw it.
    uint256 public reserved;

    /// @dev What a winner has left to spend on tickets, once they have asked to be paid in
    ///      them. A Megapot ticket costs about a megagas to mint and the public RPCs refuse a
    ///      transaction past roughly 16.7M, so a share worth hundreds of tickets can never be
    ///      converted in one call however it is written. Rather than clamp the winner to
    ///      whatever fits and hand back the rest as cash, the remainder is held here and they
    ///      come back for more. It stays inside `reserved` the whole time, so it is still
    ///      their money and the owner can never reach it.
    mapping(uint16 => mapping(address => uint256)) public ticketCredit;

    /// @dev The address the keeper files verdicts from. It is a courier and not an authority:
    ///      `resolveFor` verifies a covalidator signature over a handle this contract stored,
    ///      so the worst a captured resolver can do is decline to file. It cannot invent a
    ///      winner, and every player keeps `unseal`/`resolve` to file for themselves.
    address public resolver;

    /// @dev The house cut, taken off the pot at `settle` and only when somebody won. A case
    ///      nobody solved leaves its pot as house surplus instead of refunding failed guesses.
    uint16 public rakeBps = 500; // 5.00%
    uint16 public constant MAX_RAKE_BPS = 1000; // the ceiling the owner cannot raise past

    /// @dev Paid on top of a share that leaves as Megapot tickets, funded by the referral
    ///      Megapot pays this contract on those same purchases. That referral is 10% of the
    ///      spend, so a bonus of half it is covered by the purchase that triggers it.
    uint16 public ticketBonusBps = 500; // 5.00%

    uint256 public minStake = 100_000; // 0.10 USDC
    uint256 public maxStake = 5_000_000; // 5.00 USDC

    /// @dev The bounds a case took money under, fixed the moment it opened. `stake` reads these
    ///      rather than the live pair above, so moving the range cannot change the terms of a
    ///      case that already has other people's money in it. Held beside the `Case` struct
    ///      rather than in it so the public `cases` getter keeps the shape clients read it by.
    mapping(uint16 => uint128) public caseMinStake;
    mapping(uint16 => uint128) public caseMaxStake;

    /// @dev Megapot's quick-pick buyer batches, so a large share takes several calls. The
    ///      ceiling below is a bound on gas, not a promise about what a share converts to:
    ///      whatever it refuses leaves as USDC down the remainder path in `payout`.
    ///
    ///      Ten a call, which is Megapot's own per-transaction limit on every immediate
    ///      purchase route. The figure comes off the chain: a quick-pick costs 1,305,946 gas
    ///      here, measured, so ten lands near 13M and the public RPCs refuse anything past
    ///      roughly 16.7M.
    ///
    ///      Ten a call is not ten in total. What the call cannot take is kept as
    ///      `ticketCredit` and the winner comes back for the next ten, as often as they like,
    ///      until the whole share has been converted. `BatchPurchaseFacilitator` is the
    ///      protocol's own answer to the same problem and would do it in one order, but it is
    ///      not deployed on Base Sepolia: the published table is mainnet only and the mainnet
    ///      address holds an unrelated contract here.
    uint256 public constant TICKETS_PER_BATCH = 10;
    uint256 public constant FULL_REFERRAL_SPLIT = 1e18;
    bytes32 public constant SOURCE = bytes32("mentalist");

    /// @dev How long after a case closes a player has to file.
    ///
    ///      Sized against the keeper's REAL cadence, not its nominal one. The schedule asks
    ///      GitHub for every five minutes and GitHub delivers roughly hourly, with gaps of an
    ///      hour and a half observed, because it throttles scheduled workflows hard. At ten
    ///      minutes the keeper never once arrived inside the window: it turned up late, found
    ///      filing closed, and settled a case whose winner had never been filed. A player who
    ///      read the room correctly may not get paid if they never file, which is the same thing
    ///      as being wrong. `settle` is permissionless and
    ///      every extra filing shrinks the shares of everyone who filed already, so whoever is
    ///      in first is paid to close the books at the first legal instant. Bounding both ends
    ///      with the same window is what stops that being a race: by the moment anybody may
    ///      settle, nobody may still file, so settling early wins nothing.
    uint64 public constant FILING_WINDOW = 2 hours;

    // ─────────────────────────────────────────── events

    event CaseOpened(uint16 indexed caseId, uint8 suspects, uint64 closesAt);
    /// @dev No person id here, in either direction. That is the point of the whole contract.
    event Staked(uint16 indexed caseId, address indexed player, uint256 amount, uint128 pot);
    event Resolved(uint16 indexed caseId, address indexed player, bool won);
    event Settled(uint16 indexed caseId, uint128 pot, uint128 winningStake, uint32 winners);
    event RakeTaken(uint16 indexed caseId, uint256 amount);
    event TicketsBought(uint16 indexed caseId, address indexed player, uint256[] ticketIds, uint256 creditLeft);
    event BatchOrdered(uint16 indexed caseId, address indexed player, uint256 tickets, uint256 creditLeft);
    event CreditTaken(uint16 indexed caseId, address indexed player, uint256 amount);
    event ResolverSet(address indexed resolver);
    event PaidOut(uint16 indexed caseId, address indexed player, uint256 share, uint256[] ticketIds);

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
    error NotResolver();
    error LengthMismatch();
    error NoCredit();

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
     * @param encryptedAnswer the killer's person id, encrypted on the author's machine
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
        // Ten minutes is the floor. A case shorter than the filing window would close
        // and settle in the same breath, and nobody could get a verdict in.
        if (suspects < 2 || openFor < 10 minutes) revert BadConfig();
        if (msg.value < inco.getFee()) revert FeeTooLow();

        // Force the answer into 0..suspects-1 inside the enclave. An author who sealed an id
        // no seat has would make every honest bet lose and themselves the only account that
        // could ever win, and because both sides are ciphertexts nobody could tell that apart
        // from a lucky guess. `rem` costs no Inco fee: it is an operation on an existing
        // handle, not an ingest.
        euint256 answer = e.rem(encryptedAnswer.newEuint256(msg.sender), uint256(suspects));
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
            exists: true,
            filed: 0
        });

        // Terms of the market, taken now rather than read live at `stake`. A player who put
        // money down under one range must not find it widened underneath them by `setStakeRange`
        // once the pot has formed and there is something to size an entry against.
        caseMinStake[caseId] = uint128(minStake);
        caseMaxStake[caseId] = uint128(maxStake);

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
     *      re-ingested. The *reading* of it does not happen here: see `unseal`. Only the
     *      contract is granted the bit now, and the player gets it once the case has closed.
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
        uint256 lo = caseMinStake[caseId];
        uint256 hi = caseMaxStake[caseId];
        if (amount < lo || amount > hi) revert StakeOutOfRange(lo, hi);
        if (msg.value < inco.getFee()) revert FeeTooLow();

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        euint256 named = encryptedBet.newEuint256(msg.sender);
        ebool right = e.eq(named, _answer[caseId]);
        // Deliberately no `e.allow(right, msg.sender)` here. An Inco grant is persistent and
        // live the moment this transaction confirms, and the covalidator decrypts on the
        // strength of that grant alone: it has no idea what `closesAt` is. Granting now would
        // let anyone buy the answer by staking the minimum from a handful of throwaway wallets
        // and reading the bits back, while the case is still taking money. `unseal` hands the
        // player their bit after the close instead.
        e.allowThis(right);

        _correct[caseId][msg.sender] = right;
        verdictHandle[caseId][msg.sender] = ebool.unwrap(right);

        bets[caseId][msg.sender] = Bet({ stake: uint128(amount), resolved: false, won: false, paid: false });
        _players[caseId].push(msg.sender);

        c.pot += uint128(amount);
        c.entrants += 1;
        reserved += amount;

        emit Staked(caseId, msg.sender, amount, c.pot);
    }

    // ─────────────────────────────────────────── the result

    /**
     * @notice Take the key to your own verdict bit, once the case has stopped taking money.
     *
     * @dev This grant, and not the clock in `resolve`, is what keeps the answer from leaking
     *      while money is still moving. The covalidator will decrypt for anyone the on-chain
     *      ACL says may read, and that check has no time in it, so refusing an early *filing*
     *      refuses nothing that matters: the player would already have the plaintext. Held
     *      back to here, a bet buys nothing but a bet until the market is shut.
     *
     *      Permissionless within a case, because it only ever hands a player a bit that was
     *      already theirs. `allowThis` at stake time is what lets the contract do this later,
     *      so there is no re-ingest and no Inco fee: it is one ACL write.
     */
    function unseal(uint16 caseId) external {
        Case storage c = cases[caseId];
        if (!c.exists) revert NoSuchCase();
        if (block.timestamp < c.closesAt) revert CaseStillOpen();
        if (bets[caseId][msg.sender].stake == 0) revert NothingStaked();

        e.allow(_correct[caseId][msg.sender], msg.sender);
    }

    /**
     * @notice Hand the resolver the keys to a batch of verdict bits, so it can file for
     *         players who would otherwise have to come back and do it themselves.
     *
     * @dev Gated to the resolver and to after the close, and the second half is the half that
     *      matters. Every guard in `unseal` is here for the same reason: an ACL grant before
     *      the close is the whole game, because the covalidator will decrypt for anyone the
     *      ACL admits and that check has no clock in it. Whoever held this key early could
     *      stake a dollar, read whether they were right, and repeat until the room fell.
     *
     *      Granting the resolver reveals nothing the market has not already ended: a bit
     *      saying whether a player named him, after the last moment anybody could act on it.
     */
    function unsealFor(uint16 caseId, address[] calldata room) external {
        if (msg.sender != resolver) revert NotResolver();
        Case storage c = cases[caseId];
        if (!c.exists) revert NoSuchCase();
        if (block.timestamp < c.closesAt) revert CaseStillOpen();

        for (uint256 i; i < room.length; ++i) {
            if (bets[caseId][room[i]].stake == 0) continue;
            e.allow(_correct[caseId][room[i]], msg.sender);
        }
    }

    /**
     * @notice File your result once the case has closed.
     *
     * @dev Model A settlement: the *contract* rules, by verifying a covalidator attestation
     *      over this player's own verdict bit and checking the handle is the one it stored.
     *      A market that took the client's word for who won would be a scoreboard.
     *
     *      The window is `closesAt` to `closesAt + FILING_WINDOW`, and it is a clock rather
     *      than the `settled` flag on purpose. Reading the flag here would end the window the
     *      instant somebody called `settle`, which is a thing a filed winner profits from
     *      doing at the first legal second: every filing after theirs shrinks their share.
     */
    function resolve(
        uint16 caseId,
        DecryptionAttestation calldata attestation,
        bytes[] calldata signatures
    ) external {
        _credit(caseId, msg.sender, attestation, signatures);
    }

    /**
     * @notice File somebody else's result. Permissionless, and it has to be no weaker for it.
     *
     * @dev Delegating settlement costs nothing in trust here, which is the property the whole
     *      keeper rests on. This does not take the caller's word for anything: the handle must
     *      be the one this contract stored for that player, and the value must carry a live
     *      covalidator signature over it. A caller cannot forge a win, cannot move a bit from
     *      one player to another, and cannot file twice. All they can do is carry a verdict
     *      that was already true, which is why anyone may do it and why nobody has to.
     */
    function resolveFor(
        uint16 caseId,
        address player,
        DecryptionAttestation calldata attestation,
        bytes[] calldata signatures
    ) external {
        _credit(caseId, player, attestation, signatures);
    }

    /// @notice File a whole room in one transaction. What the keeper actually calls.
    function resolveMany(
        uint16 caseId,
        address[] calldata room,
        DecryptionAttestation[] calldata attestations,
        bytes[][] calldata signatures
    ) external {
        if (room.length != attestations.length || room.length != signatures.length) {
            revert LengthMismatch();
        }
        for (uint256 i; i < room.length; ++i) {
            // One player already filed for themselves should not strand the rest of the room,
            // so a duplicate is skipped rather than reverted. Everything else still throws:
            // a bad signature or a mismatched handle is a broken batch, not a slow player.
            if (bets[caseId][room[i]].resolved) continue;
            _credit(caseId, room[i], attestations[i], signatures[i]);
        }
    }

    function _credit(
        uint16 caseId,
        address player,
        DecryptionAttestation calldata attestation,
        bytes[] calldata signatures
    ) internal {
        Case storage c = cases[caseId];
        if (!c.exists) revert NoSuchCase();
        if (block.timestamp < c.closesAt) revert CaseStillOpen();
        // Too late to file: the books are closed, or close the moment anyone asks.
        if (block.timestamp >= c.closesAt + FILING_WINDOW) revert AlreadySettled();

        Bet storage b = bets[caseId][player];
        if (b.stake == 0) revert NothingStaked();
        if (b.resolved) revert AlreadyResolved();

        if (attestation.handle != verdictHandle[caseId][player]) revert HandleMismatch();
        if (!inco.incoVerifier().isValidDecryptionAttestation(attestation, signatures)) {
            revert InvalidAttestation();
        }

        bool won = asBool(attestation.value);
        b.resolved = true;
        b.won = won;
        c.filed += 1;

        if (won) {
            _winningStakeBefore[caseId][player] = c.winningStake;
            c.winningStake += b.stake;
            c.winners += 1;
        }

        emit Resolved(caseId, player, won);
    }

    /**
     * @notice Close the books. Permissionless, once everyone has had time to file.
     *
     * @dev It opens exactly where `FILING_WINDOW` ends, so a slow filer is never cut out of
     *      their own win by a fast one. Being first here used to be worth the whole pot: file,
     *      settle, and every other winner is locked out of `resolve`, out of `payout` because
     *      they never filed, and out of any payout because the case did have a winner.
     */
    function settle(uint16 caseId) external {
        Case storage c = cases[caseId];
        if (!c.exists) revert NoSuchCase();
        if (c.settled) revert AlreadySettled();
        // Money must never move while the case is still taking it.
        if (block.timestamp < c.closesAt) revert CaseStillOpen();

        // The wait exists to stop a fast filer settling a slow one out of a win they had
        // earned: once the books shut, an unfiled player is locked out of `resolve`, out of
        // `payout` because they never filed, and out of any payout because the case did have a
        // winner. That risk is a function of who is still missing, not of the clock. With
        // every entrant already filed there is nobody left to cut out, so the window has
        // nothing to protect and waiting it out is dead time the winner pays for.
        if (c.filed < c.entrants && block.timestamp < c.closesAt + FILING_WINDOW) {
            revert CaseStillOpen();
        }

        c.settled = true;

        // The cut comes off here rather than at the door. Taken on the way in it would have
        // to be given back on a refund path. A no-winner pot is released from `reserved` below,
        // while a winning pot remains owed to the winners until payout. The pot the shares
        // divide is after the cut, so `shareOf` needs no knowledge of any of this.
        if (c.winners != 0 && rakeBps != 0) {
            uint256 rake = (uint256(c.pot) * rakeBps) / 10_000;
            if (rake != 0) {
                c.pot -= uint128(rake);
                // It stops being owed to anyone, which is what makes it reachable by
                // `withdrawSurplus` and by the ticket bonus below.
                reserved -= rake;
                emit RakeTaken(caseId, rake);
            }
        }

        // A failed guess is a loss even when nobody found the answer. Release the no-winner
        // pot from reserved so it becomes owner-withdrawable surplus, rather than exposing a
        // payout path that turns every all-loser case into a free game.
        if (c.winners == 0) {
            reserved -= c.pot;
        }

        emit Settled(caseId, c.pot, c.winningStake, c.winners);
    }

    // ─────────────────────────────────────────── payout

    /**
     * @notice Your share: the whole pot, split by stake among everyone who named him.
     *
     * @dev Each winner takes the slice of the pot lying between the winning stake filed
     *      before them and their own. Dividing per winner instead would floor once each, and
     *      the few micro-USDC that left over would stay in `reserved` forever: it is counted
     *      as owed, so `withdrawSurplus` can never reach it either. Cut this way the floors
     *      telescope, the shares add up to the pot exactly, and `reserved` returns to zero.
     */
    function shareOf(uint16 caseId, address player) public view returns (uint256) {
        Case memory c = cases[caseId];
        Bet memory b = bets[caseId][player];
        if (!b.won || c.winningStake == 0) return 0;
        uint256 before = _winningStakeBefore[caseId][player];
        uint256 upTo = (uint256(c.pot) * (before + b.stake)) / c.winningStake;
        return upTo - ((uint256(c.pot) * before) / c.winningStake);
    }

    /**
     * @notice Collect, in Megapot tickets.
     *
     * @dev Tickets rather than cash on purpose: reading a room correctly buys real lottery
     *      entries, and the stakes of everyone who read it wrong are what buy them.
     *
     *      `TICKETS_PER_BATCH` of them here, and the rest whenever they ask: what this call
     *      cannot convert is kept as `ticketCredit` and `buyMoreTickets` spends the next ten,
     *      as often as they like, until the whole share has become entries. A winner is no
     *      longer capped at what one transaction's gas can hold, and `takeCredit` turns any
     *      remainder back into USDC if they would rather stop.
     *
     *      Note for callers: the live buyer costs roughly a million gas a ticket, so a payout
     *      at the ceiling is around ninety million. That is well inside a Base block and well
     *      outside what the public RPCs will `eth_estimateGas`, which refuses anything past
     *      about 16.7M. Send this with an explicit gas limit or it never leaves the wallet.
     */
    function payout(uint16 caseId, bool wantTickets)
        external
        nonReentrant
        returns (uint256[] memory ticketIds)
    {
        return _payout(caseId, msg.sender, wantTickets);
    }

    /// @notice Let the resolver submit a winner's payout without requiring the winner to pay gas.
    function payoutFor(uint16 caseId, address player, bool wantTickets)
        external
        nonReentrant
        returns (uint256[] memory ticketIds)
    {
        if (msg.sender != resolver) revert NotResolver();
        return _payout(caseId, player, wantTickets);
    }

    function _payout(uint16 caseId, address player, bool wantTickets)
        internal
        returns (uint256[] memory ticketIds)
    {
        Case storage c = cases[caseId];
        if (!c.settled) revert NotSettled();

        Bet storage b = bets[caseId][player];
        if (b.stake == 0) revert NothingStaked();
        if (!b.resolved) revert NotResolved();
        if (b.paid) revert AlreadyPaid();
        if (!b.won) revert DidNotWin();

        uint256 share = shareOf(caseId, player);
        b.paid = true;

        // Taking tickets pays better than taking the cash, because Megapot pays this contract
        // a referral on the purchase that is twice what the bonus costs. The bonus is capped
        // at the surplus actually sitting here (rake plus swept referral, never staked money,
        // since `reserved` is subtracted first) so it can only ever be paid out of money the
        // house really has. If that well is dry the tickets still buy, just without the top
        // up: a winner is never made to wait on the house's balance sheet.
        uint256 bonus;
        if (wantTickets && ticketBonusBps != 0) {
            uint256 held = usdc.balanceOf(address(this));
            uint256 surplus = held > reserved ? held - reserved : 0;
            bonus = (share * ticketBonusBps) / 10_000;
            if (bonus > surplus) bonus = surplus;
        }

        // By the share, not the stake: a winner leaves with the losers' money too, and
        // reserving only what they put in would lock their winnings in here forever.
        reserved -= share;
        uint256 budget = share + bonus;
        return _buyAndBank(caseId, player, budget, wantTickets);
    }

    /**
     * @notice Convert the next ten tickets' worth of what you are owed.
     *
     * @dev The reason a winner has to come back at all is gas: a ticket costs about a megagas
     *      to mint and no transaction gets past roughly 16.7M, so a share worth a hundred
     *      tickets cannot become a hundred tickets in one call however it is written. Rather
     *      than clamp them to whatever fits and push the rest back as cash, the remainder
     *      stays theirs and this spends it, ten at a time, for as long as it lasts.
     */
    function buyMoreTickets(uint16 caseId) external nonReentrant returns (uint256[] memory) {
        if (ticketCredit[caseId][msg.sender] == 0) revert NoCredit();
        return _spendCredit(caseId, msg.sender);
    }

    /// @notice Convert a winner's remaining ticket credit without requiring their wallet to pay gas.
    function buyMoreTicketsFor(uint16 caseId, address player)
        external
        nonReentrant
        returns (uint256[] memory)
    {
        if (msg.sender != resolver) revert NotResolver();
        if (ticketCredit[caseId][player] == 0) revert NoCredit();
        return _spendCredit(caseId, player);
    }

    /**
     * @notice Take whatever is left of your ticket money as USDC instead.
     *
     * @dev The escape hatch, and the reason holding a remainder is safe: Megapot can be shut,
     *      the price can move, a winner can simply change their mind, and none of that may
     *      leave their money sitting in here. It is inside `reserved` until it is taken, so
     *      `withdrawSurplus` can never reach it either.
     */
    function takeCredit(uint16 caseId) external nonReentrant {
        uint256 amount = ticketCredit[caseId][msg.sender];
        if (amount == 0) revert NoCredit();
        ticketCredit[caseId][msg.sender] = 0;
        reserved -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit CreditTaken(caseId, msg.sender, amount);
    }

    /// @dev The first conversion, straight off a payout.
    function _buyAndBank(
        uint16 caseId,
        address player,
        uint256 budget,
        bool wantTickets
    ) internal returns (uint256[] memory ids) {
        if (!wantTickets) {
            usdc.safeTransfer(player, budget);
            emit PaidOut(caseId, player, budget, new uint256[](0));
            return new uint256[](0);
        }
        // Banked first, spent second, so both paths run the same code and there is exactly
        // one place that knows how to turn credit into tickets.
        ticketCredit[caseId][player] = budget;
        reserved += budget;
        ids = _spendCredit(caseId, player);

        // Anything that cannot become a ticket goes home as cash in this same transaction.
        // Holding it back would strand a winner's money behind a second call for no gain, and
        // it covers the case where Megapot is shut outright: the share still leaves, in full,
        // exactly as it did before any of this existed.
        uint256 left = ticketCredit[caseId][player];
        if (left != 0) {
            uint256 price = jackpot.ticketPrice();
            if (price == 0 || left < price || !jackpot.allowTicketPurchases()) {
                ticketCredit[caseId][player] = 0;
                reserved -= left;
                usdc.safeTransfer(player, left);
            }
        }

        emit PaidOut(caseId, player, budget, ids);
    }

    /// @dev Spends up to `TICKETS_PER_BATCH` of a player's credit on real Megapot entries.
    function _spendCredit(uint16 caseId, address player) internal returns (uint256[] memory ticketIds) {
        uint256 credit = ticketCredit[caseId][player];
        uint256 price = jackpot.ticketPrice();

        uint256 count;
        if (price != 0 && jackpot.allowTicketPurchases()) {
            count = credit / price;
        }
        if (count == 0) return new uint256[](0);

        address[] memory referrers = new address[](1);
        uint256[] memory split = new uint256[](1);
        referrers[0] = address(this);
        split[0] = FULL_REFERRAL_SPLIT;

        // The bulk route first, because it is the only one that scales. Minting a ticket costs
        // about a megagas and no transaction survives past roughly 16.7M, so an immediate
        // purchase can never carry more than ten however it is written. Ordering does not work
        // that way: twenty-five tickets cost 277k gas to register and Megapot's keeper mints
        // them out afterwards. A share worth two hundred entries becomes two hundred entries.
        //
        // Skipped when the facilitator is unset, when the order would fall under its minimum,
        // or when this player already has one in flight, since it keys orders by recipient.
        if (address(batchFacilitator) != address(0) && count > TICKETS_PER_BATCH) {
            uint256 minimum = batchFacilitator.minimumTicketCount();
            if (count >= minimum && !batchFacilitator.hasActiveBatchOrder(player)) {
                uint256 bulkCost = price * count;
                ticketCredit[caseId][player] = credit - bulkCost;
                reserved -= bulkCost;

                usdc.forceApprove(address(batchFacilitator), bulkCost);
                batchFacilitator.createBatchOrder(
                    player,
                    uint64(count),
                    new IJackpot.Ticket[](0),
                    referrers,
                    split,
                    SOURCE
                );
                usdc.forceApprove(address(batchFacilitator), 0);

                // The keeper mints these later, so there are no ids to hand back yet. The
                // count is what the event carries and what a client counts.
                emit BatchOrdered(caseId, player, count, ticketCredit[caseId][player]);
                return new uint256[](0);
            }
        }

        if (count > TICKETS_PER_BATCH) count = TICKETS_PER_BATCH;
        uint256 cost = price * count;
        ticketCredit[caseId][player] = credit - cost;
        reserved -= cost;

        usdc.forceApprove(address(ticketBuyer), cost);
        ticketIds = ticketBuyer.buyTickets(count, player, referrers, split, SOURCE);
        usdc.forceApprove(address(ticketBuyer), 0);

        emit TicketsBought(caseId, player, ticketIds, ticketCredit[caseId][player]);
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

    /// @notice All wallets that staked in a case.
    function players(uint16 caseId) external view returns (address[] memory) {
        return _players[caseId];
    }

    // ─────────────────────────────────────────── admin

    function sweepReferralFees() external {
        jackpot.claimReferralFees();
    }

    /**
     * @notice Re-time any case that has not settled yet.
     *
     * @dev `closesAt` is otherwise written once, in `openCase`, and a case cannot be opened
     *      twice. This is intentionally owner-only and exists to let the operator run and
     *      repeat cases during testing, including rooms that already contain bets. The answer
     *      and every bet remain unchanged; only the settlement clock moves.
     */
    function reschedule(uint16 caseId, uint64 openFor) external onlyOwner {
        Case storage c = cases[caseId];
        if (!c.exists) revert NoSuchCase();
        if (c.settled) revert AlreadySettled();
        if (openFor < 10 minutes) revert BadConfig();

        c.closesAt = uint64(block.timestamp) + openFor;
        emit CaseOpened(caseId, c.suspects, c.closesAt);
    }

    /// @dev Only ever the terms of the *next* case: an open one keeps the range it opened
    ///      under. The uint128 bound is what makes the snapshot in `openCase` safe to narrow.
    function setStakeRange(uint256 min, uint256 max) external onlyOwner {
        if (min == 0 || max < min || max > type(uint128).max) revert BadConfig();
        minStake = min;
        maxStake = max;
    }

    /// @notice Name the address allowed to take keys on players' behalf, so the keeper can
    ///         file a whole room and nobody has to come back to collect a win they already had.
    /// @dev Losing this key loses nothing: it cannot forge a verdict, and every player can
    ///      still `unseal` and `resolve` for themselves. Set it to zero to turn the keeper off.
    /// @notice Point at Megapot's batch facilitator, or at zero to stop using it.
    function setBatchFacilitator(address to) external onlyOwner {
        batchFacilitator = IBatchPurchaseFacilitator(to);
    }

    function setResolver(address to) external onlyOwner {
        resolver = to;
        emit ResolverSet(to);
    }

    /// @dev Applies at `settle`, so it is only ever the terms of a case that has not yet been
    ///      closed. Bounded by a constant the owner cannot raise, because a rake settable to
    ///      100% after the money is in is not a rake, it is a switch that takes the pot.
    function setRake(uint16 bps, uint16 bonusBps) external onlyOwner {
        if (bps > MAX_RAKE_BPS) revert BadConfig();
        rakeBps = bps;
        ticketBonusBps = bonusBps;
    }

    /// @dev Only ever referral fees. Never staked funds.
    function withdrawSurplus(address to) external onlyOwner {
        uint256 bal = usdc.balanceOf(address(this));
        if (bal <= reserved) revert BadConfig();
        usdc.safeTransfer(to, bal - reserved);
    }

    /**
     * @dev The Inco fee float only. Stakes are USDC and are covered by `reserved`, so there
     *      is nothing of a player's in here to take.
     *
     *      `quoteFee` deliberately quotes twice the fee so a bump between the quote and the
     *      send does not fail the transaction, and Inco draws the fee from this contract's
     *      balance rather than from `msg.value`. So roughly one fee accretes per stake and
     *      per case opened, and without this it would sit here forever.
     */
    function withdrawEth(address to) external onlyOwner {
        (bool ok, ) = to.call{ value: address(this).balance }("");
        if (!ok) revert BadConfig();
    }
}
