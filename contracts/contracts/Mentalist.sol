// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { e, ebool, euint256, inco } from "@inco/lightning/src/Lib.sol";
import { DecryptionAttestation } from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import { asBool } from "@inco/lightning/src/shared/TypeUtils.sol";

/**
 * @title  Mentalist: a confidential deduction game
 * @notice Nine suspects. One is Red John. Some of them lie, and Red John always does.
 *         You interrogate witnesses with yes/no questions about subsets of the lineup.
 *
 *         The mechanic this game exists for is one line:
 *
 *             ebool answer = e.xor(truth, liar[witness]);
 *
 *         The answer you receive is the truth about a secret you're hunting, corrupted by
 *         a *second* secret you also can't see. No transparent chain can run that, and
 *         commit-reveal cannot emulate it, proving the answer was computed honestly would
 *         mean opening the honesty bit, which is the very thing the game is about.
 *
 * @dev    Inco is TEE-based confidential compute, NOT FHE and NOT zk. "Secret" means
 *         decrypted inside an enclave; "provably fair" means a covalidator attestation.
 */
contract Mentalist {
    using e for *;

    // ─────────────────────────────────────────── constants

    uint8 public constant MIN_SUSPECTS = 3;
    uint8 public constant MAX_SUSPECTS = 12;

    /// @dev A control question (mask covers every suspect) is a guaranteed honesty test,
    ///      so it is deliberately the expensive move. This price is the whole economy.

    // ─────────────────────────────────────────── types

    enum Status {
        None,
        Open, // accepting interrogations
        Accused, // accusation made, verdict revealed, awaiting settlement
        Closed // settled
    }

    struct Case {
        address detective;
        uint8 suspects;
        uint8 liars;
        uint8 focusLeft;
        uint8 questionsAsked;
        uint8 accusedSeat;
        uint8 turnAt; // 0 = disabled; else Red John turns a witness after this many questions
        bool turned; // has the turncoat event fired
        bool solved;
        Status status;
        uint64 openedAt;
    }

    // ─────────────────────────────────────────── state

    uint256 public nextCaseId = 1;

    mapping(uint256 => Case) public cases;

    /// @dev caseId => seat => "is this suspect Red John". Never granted to anyone.
    mapping(uint256 => mapping(uint8 => ebool)) internal _guilt;
    /// @dev caseId => seat => "does this suspect lie". Never granted to anyone.
    /// @dev caseId => questionId => the answer, granted to the detective only.

    /// @dev The handle settlement must attest over, the accused seat's guilt bit.
    mapping(uint256 => bytes32) public verdictHandle;

    /// @dev The seat holding the account that cannot be true. Never leaves the enclave.
    mapping(uint256 => euint256) internal _tellSeat;
    /// @dev seat -> the encrypted index of the account that seat gives.
    mapping(uint256 => mapping(uint8 => euint256)) internal _statement;

    /// @dev The most recent case a detective opened. Used to force abandoned cases to
    ///      resolve as losses, see `openCase`.
    mapping(address => uint256) public latestCaseOf;

    mapping(address => uint32) public streak;
    mapping(address => uint32) public bestStreak;
    mapping(address => uint32) public casesSolved;
    mapping(address => uint32) public casesPlayed;

    // ─────────────────────────────────────────── events

    event CaseOpened(
        uint256 indexed caseId,
        address indexed detective,
        uint8 suspects,
        uint8 liars,
        uint8 focus,
        uint8 turnAt
    );

    event RoomOpened(uint256 indexed caseId, address indexed detective, bytes32[] statementHandles);

    /// @notice Red John got to the last witness you spoke to. Their honesty bit flipped.

    /// @param guiltHandles every seat's guilt bit, revealed, the case is over
    /// @dev No seat here on purpose: who you named is encrypted and must stay that way.
    event Accused(
        uint256 indexed caseId,
        address indexed detective,
        bytes32 verdict,
        bytes32[] guiltHandles
    );

    /// @notice A case left unresolved when its detective opened a new one. Scored as a loss.
    event CaseAbandoned(uint256 indexed caseId, address indexed detective);

    event CaseClosed(
        uint256 indexed caseId,
        address indexed detective,
        bool solved,
        uint8 focusLeft,
        uint32 newStreak
    );

    // ─────────────────────────────────────────── errors

    error BadConfig();
    /// @dev Ingesting a ciphertext costs an Inco fee, and it has to be covered.
    error FeeTooLow();
    /// @dev He has already said his piece. Everyone speaks exactly once.
    error AlreadyHeard();
    /// @dev You named someone and never filed the verdict. Settle it before opening another.
    error UnsettledCase(uint256 caseId);
    error NotYourCase();
    error WrongStatus();
    error NoFocusLeft();
    error BadWitness();
    error BadMask();
    error BadSeat();
    error FeeNotCovered(uint256 required, uint256 supplied);
    error InvalidAttestation();
    error HandleMismatch();

    // ─────────────────────────────────────────── construction

    /// @dev Payable so the deployer can seed the fee float in the same transaction.
    ///      Inco fees are drawn from *this contract's* balance, so without a payable
    ///      constructor the float has to arrive in a second transaction via `receive`.
    constructor() payable {}

    // ─────────────────────────────────────────── fees

    /**
     * @notice Total Inco fee to open a case of `suspects` seats.
     *
     * @dev One random draw decides which man is lying, and everything after it is
     *      comparison and selection, which are fee-free. Quoted with headroom rather than
     *      to the wei: the contract also carries its own float, so a rounding edge in the
     *      fee schedule can never leave a player stranded mid-deal.
     */
    function quoteOpenFee(uint8 suspects) public view returns (uint256) {
        return inco.getFee() * (uint256(suspects) + 2);
    }

    /// @notice What it costs to submit an encrypted accusation.
    /// @dev One ciphertext ingest. Quoted with headroom so a fee refresh between the quote
    ///      and the call cannot leave the player short.
    function quoteNameFee() public view returns (uint256) {
        return inco.getFee() * 2;
    }

    // ─────────────────────────────────────────── the game

    /**
     * @notice Deal a fresh case. The TEE places Red John and the liars; nobody, not the
     *         player, not this contract's deployer, not an observer, learns the layout.
     */
    function openCase(
        uint8 suspects,
        uint8 liars,
        uint8 focus,
        uint8 turnAt
    ) external payable returns (uint256 caseId) {
        if (
            suspects < MIN_SUSPECTS ||
            suspects > MAX_SUSPECTS ||
            liars == 0 ||
            liars >= suspects ||
            focus == 0 ||
            turnAt >= focus
        ) revert BadConfig();

        uint256 fee = quoteOpenFee(suspects);
        if (msg.value < fee) revert FeeNotCovered(fee, msg.value);

        // Resolving the case you left behind, without destroying one you already won.
        //
        // Settlement is player-initiated, so a detective who accused wrongly could once
        // simply never submit the attestation, leave the case hanging, and open a fresh one
        // with their streak intact. The original fix force-closed *any* unresolved previous
        // case as a loss, which was correct when a streak was the only thing at stake.
        //
        // It is not correct now that a case can carry money. A player who accused, and is
        // one transaction away from filing a verdict that says they were right, would have
        // that case rewritten as a loss the moment they opened another one, and the market
        // settles on exactly that flag. So the two states are treated differently:
        //
        //   Open     you walked away without even naming anyone. That is a loss.
        //   Accused  the answer already exists and only you can file it. File it first.
        //
        // Neither leaves a route to a free abandon, and neither can turn a win into a loss.
        uint256 previous = latestCaseOf[msg.sender];
        if (previous != 0) {
            Status prior = cases[previous].status;
            if (prior == Status.Accused) revert UnsettledCase(previous);
            if (prior == Status.Open) {
                cases[previous].status = Status.Closed;
                cases[previous].solved = false;
                streak[msg.sender] = 0;
                emit CaseAbandoned(previous, msg.sender);
            }
        }

        caseId = nextCaseId++;
        latestCaseOf[msg.sender] = caseId;

        _deal(caseId, suspects, liars);

        cases[caseId] = Case({
            detective: msg.sender,
            suspects: suspects,
            liars: liars,
            focusLeft: focus,
            questionsAsked: 0,
            accusedSeat: type(uint8).max,
            turnAt: turnAt,
            turned: false,
            solved: false,
            status: Status.Open,
            // Recorded for display only, never compared against, so validator drift is
            // not a concern here.
            // forge-lint: disable-next-line(block-timestamp,unsafe-typecast)
            openedAt: uint64(block.timestamp)
        });

        casesPlayed[msg.sender] += 1;

        emit CaseOpened(caseId, msg.sender, suspects, liars, focus, turnAt);
    }

    /**
     * @notice Place Red John and the liars for a fresh case.
     *
     * @dev The randomness lives in a *permutation*, not in N separate draws: build a list
     *      whose contents are public knowledge (one guilty, the rest innocent) and shuffle
     *      it once. Every seat's marginal distribution is uniform by construction, so
     *      there is no rejection-sampling bias to get wrong, and it costs one op, not N.
     *      It also gives *exactly* `liars` liars, which is a much better thing to be able
     *      to tell the player than "roughly a third of them".
     *
     *      `virtual` for one reason, and it is a tooling limitation rather than a design
     *      choice: the Inco Lightning v1.0.0 package's in-process Foundry mock (`IncoTest`)
     *      implements the scalar operations but **not** the elist ops, so a contract that
     *      shuffles cannot run under `forge test` at all. Overriding just the dealer lets
     *      the fast suite exercise every rule of the game, the encrypted lie, the Focus
     *      economy, access control, the turncoat, settlement, while this real dealing
     *      path is covered against a live covalidator by the Hardhat integration test.
     */
    function _deal(uint256 caseId, uint8 suspects, uint8 /* liars */) internal {
        // One seat holds the alibi that cannot be true, and which seat that is, is the only
        // thing about this case that is secret. Everything else, the room, the people, the
        // words they say, is written down in the open where anyone can read it.
        euint256 tellSeat = e.randBounded(uint256(suspects));
        _tellSeat[caseId] = tellSeat;
        e.allowThis(tellSeat);

        for (uint8 i = 0; i < suspects; i++) {
            euint256 seatIx = e.asEuint256(uint256(i));
            ebool isTell = e.eq(tellSeat, seatIx);

            // The honest alibis are handed out in written order, skipping whoever holds the
            // tell, so no two men ever give the same account of the evening. Seat i takes
            // account i if it sits before the liar, and account i-1 if it sits after.
            ebool before = e.lt(seatIx, tellSeat);
            euint256 honest = e.select(
                before,
                seatIx,
                e.asEuint256(i == 0 ? 0 : uint256(i) - 1)
            );

            // The impossible account is always written last, so the tell is the final slot.
            euint256 slot = e.select(isTell, e.asEuint256(uint256(suspects) - 1), honest);

            _guilt[caseId][i] = isTell;
            _statement[caseId][i] = slot;
            e.allowThis(isTell);
            e.allowThis(slot);
        }
    }

    /**
     * @notice Open the room. Every account in it becomes readable, to you and to nobody else.
     *
     * @dev    One transaction, once, and then the interrogation itself is free.
     *
     *         An earlier version granted one account per click, which put a wallet signature
     *         in front of every single suspect and turned a conversation into a queue of
     *         confirmation dialogs. The confidentiality never needed that: what has to stay
     *         secret is *which man gives which account*, and that is decided once when the
     *         case is dealt. Granting the whole set at once reveals it to this detective
     *         alone and lets the room be played at the speed of talking.
     *
     *         This is also the point of no return for the market. A seat has to be claimed
     *         while `questionsAsked` is still zero, so a player cannot read a room, dislike
     *         what it says, and go looking for an easier one to bet on.
     */
    function beginHearing(uint256 caseId) external returns (bytes32[] memory handles) {
        Case storage c = cases[caseId];
        if (c.status != Status.Open) revert WrongStatus();
        if (c.detective != msg.sender) revert NotYourCase();
        if (c.questionsAsked != 0) revert AlreadyHeard();

        handles = new bytes32[](c.suspects);
        for (uint8 i = 0; i < c.suspects; i++) {
            euint256 slot = _statement[caseId][i];
            e.allow(slot, msg.sender); // selective reveal: the detective, and nobody else
            e.allowThis(slot);
            handles[i] = euint256.unwrap(slot);
        }

        c.questionsAsked = c.suspects;
        c.focusLeft = 0;

        emit RoomOpened(caseId, msg.sender, handles);
    }

    /// @notice The encrypted account each seat gives. Readable only once you have begun.
    function statementOf(uint256 caseId, uint8 seat) external view returns (euint256) {
        return _statement[caseId][seat];
    }

    /**
     * @notice Name him. The name is encrypted on your machine before it is sent.
     *
     * @dev    `encryptedSeat` is a ciphertext the player produced locally, so the seat they
     *         accuse never appears in the transaction, in the logs, or in any block
     *         explorer. The contract ingests it, compares it to the hidden seat inside the
     *         enclave, and stores an encrypted verdict that only this detective can read.
     *
     *         This closes the last plaintext leak in the game. The answer was already
     *         secret and dealt per player, but the accusation used to go out in the clear,
     *         which meant anyone watching the chain could see who you had backed and, once
     *         the board opened, whether you were right. Now both halves of the wager are
     *         confidential and the pool settles on an attestation rather than on anything
     *         anybody could read off the wire.
     *
     *         The board itself is revealed here, so the player gets a post-mortem. That is
     *         safe: every case is dealt independently, so opening your own board tells
     *         nobody anything about theirs.
     */
    function accuse(uint256 caseId, bytes calldata encryptedSeat) external payable {
        Case storage c = cases[caseId];
        if (c.status != Status.Open) revert WrongStatus();
        if (c.detective != msg.sender) revert NotYourCase();
        if (msg.value < inco.getFee()) revert FeeTooLow();

        euint256 named = encryptedSeat.newEuint256(msg.sender);
        ebool correct = e.eq(named, _tellSeat[caseId]);
        e.allow(correct, msg.sender);
        e.allowThis(correct);

        bytes32[] memory guiltHandles = new bytes32[](c.suspects);
        for (uint8 i = 0; i < c.suspects; i++) {
            ebool g = _guilt[caseId][i];
            e.reveal(g);
            guiltHandles[i] = ebool.unwrap(g);
        }

        c.status = Status.Accused;
        verdictHandle[caseId] = ebool.unwrap(correct);

        emit Accused(caseId, msg.sender, ebool.unwrap(correct), guiltHandles);
    }

    /**
     * @notice Close the case by submitting the covalidator attestation for your verdict.
     * @dev    Model A settlement: the *contract* decides whether you were right, because
     *         a streak (and, with the Megapot layer, tickets) rides on the answer. The
     *         handle-match check is load-bearing, a signature alone only proves the TEE
     *         decrypted *some* handle, so without it a player could settle on a different,
     *         conveniently-true bit.
     */
    function settle(uint256 caseId, DecryptionAttestation calldata attestation, bytes[] calldata signatures) external {
        Case storage c = cases[caseId];
        if (c.status != Status.Accused) revert WrongStatus();
        if (c.detective != msg.sender) revert NotYourCase();

        if (attestation.handle != verdictHandle[caseId]) revert HandleMismatch();
        if (!inco.incoVerifier().isValidDecryptionAttestation(attestation, signatures)) {
            revert InvalidAttestation();
        }

        bool solved = asBool(attestation.value);
        c.solved = solved;
        c.status = Status.Closed;

        if (solved) {
            uint32 s = streak[msg.sender] + 1;
            streak[msg.sender] = s;
            if (s > bestStreak[msg.sender]) bestStreak[msg.sender] = s;
            casesSolved[msg.sender] += 1;
        } else {
            streak[msg.sender] = 0;
        }

        emit CaseClosed(caseId, msg.sender, solved, c.focusLeft, streak[msg.sender]);
    }

    // ─────────────────────────────────────────── views

    /// @notice The encrypted answer to question `questionId`. Only the detective may decrypt it.

    /// @notice Handle for "is seat `i` Red John". Publishing the *handle* discloses
    ///         nothing, decryption requires an access grant, and this one is granted to
    ///         nobody until `accuse` reveals the board. The frontend needs it to paint the
    ///         post-mortem; tests need it to assert against ground truth.
    function guiltOf(uint256 caseId, uint8 seat) external view returns (ebool) {
        return _guilt[caseId][seat];
    }

    /// @notice Handle for "does seat `i` lie". Same disclosure argument as `guiltOf`.

    function getCase(uint256 caseId) external view returns (Case memory) {
        return cases[caseId];
    }

    /// @notice The full-lineup mask for a case, the control question.
    function controlMask(uint256 caseId) external view returns (uint16) {
        return _fullMask(cases[caseId].suspects);
    }

    /// @dev Mask covering every seat. `n` is bounded by MAX_SUSPECTS (12), so the shift
    ///      never exceeds 12 and the result always fits in a uint16.
    function _fullMask(uint8 n) internal pure returns (uint16) {
        // forge-lint: disable-next-line(incorrect-shift)
        return uint16((uint256(1) << n) - 1);
    }

    /// @dev Accept sponsorship so a case's Inco fee can be pre-funded rather than charged
    ///      to the player on every open.
    receive() external payable {}
}
