// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { e, ebool, inco, elist, ETypes } from "@inco/lightning/src/Lib.sol";
import { DecryptionAttestation } from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import { asBool } from "@inco/lightning/src/shared/TypeUtils.sol";

/**
 * @title  Mentalist — a confidential deduction game
 * @notice Nine suspects. One is Red John. Some of them lie, and Red John always does.
 *         You interrogate witnesses with yes/no questions about subsets of the lineup.
 *
 *         The mechanic this game exists for is one line:
 *
 *             ebool answer = e.xor(truth, liar[witness]);
 *
 *         The answer you receive is the truth about a secret you're hunting, corrupted by
 *         a *second* secret you also can't see. No transparent chain can run that, and
 *         commit-reveal cannot emulate it — proving the answer was computed honestly would
 *         mean opening the honesty bit, which is the very thing the game is about.
 *
 * @dev    Inco is TEE-based confidential compute, NOT FHE and NOT zk. "Secret" means
 *         decrypted inside an enclave; "provably fair" means a covalidator attestation.
 */
contract Mentalist {
    using e for *;

    // ─────────────────────────────────────────── constants

    uint8 public constant MIN_SUSPECTS = 4;
    uint8 public constant MAX_SUSPECTS = 12;

    /// @dev A control question (mask covers every suspect) is a guaranteed honesty test,
    ///      so it is deliberately the expensive move. This price is the whole economy.
    uint8 public constant CONTROL_COST = 2;
    uint8 public constant QUESTION_COST = 1;

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
    mapping(uint256 => mapping(uint8 => ebool)) internal _liar;
    /// @dev caseId => questionId => the answer, granted to the detective only.
    mapping(uint256 => mapping(uint16 => ebool)) internal _testimony;

    /// @dev The handle settlement must attest over — the accused seat's guilt bit.
    mapping(uint256 => bytes32) public verdictHandle;

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

    /// @param answerHandle the encrypted answer; only `detective` can decrypt it
    event Interrogated(
        uint256 indexed caseId,
        address indexed detective,
        uint16 questionId,
        uint8 witness,
        uint16 mask,
        uint8 cost,
        bytes32 answerHandle
    );

    /// @notice Red John got to the last witness you spoke to. Their honesty bit flipped.
    event WitnessTurned(uint256 indexed caseId, uint8 witness);

    /// @param guiltHandles every seat's guilt bit, revealed — the case is over
    /// @param liarHandles  every seat's honesty bit, revealed — the post-mortem
    event Accused(
        uint256 indexed caseId,
        address indexed detective,
        uint8 seat,
        bytes32 verdict,
        bytes32[] guiltHandles,
        bytes32[] liarHandles
    );

    event CaseClosed(
        uint256 indexed caseId,
        address indexed detective,
        bool solved,
        uint8 focusLeft,
        uint32 newStreak
    );

    // ─────────────────────────────────────────── errors

    error BadConfig();
    error NotYourCase();
    error WrongStatus();
    error NoFocusLeft();
    error BadWitness();
    error BadMask();
    error BadSeat();
    error FeeNotCovered(uint256 required, uint256 supplied);
    error InvalidAttestation();
    error HandleMismatch();

    // ─────────────────────────────────────────── fees

    /// @notice Total Inco fee to open a case of `suspects` seats.
    /// @dev Two encrypted lists (guilt, honesty), each created then shuffled: 4 list ops.
    ///      Every other move in the game — getEbool, or, xor, not, allow — is fee-free,
    ///      so interrogation is an ordinary cheap Base transaction.
    function quoteOpenFee(uint8 suspects) public pure returns (uint256) {
        return 4 * inco.getEListFee(uint16(suspects), ETypes.Bool);
    }

    // ─────────────────────────────────────────── the game

    /**
     * @notice Deal a fresh case. The TEE places Red John and the liars; nobody — not the
     *         player, not this contract's deployer, not an observer — learns the layout.
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

        caseId = nextCaseId++;

        // ── Place Red John and the liars.
        //
        // The randomness lives in the *permutation*, not in N separate draws: build a list
        // whose contents are public knowledge (one guilty, the rest innocent) and shuffle
        // it once. The marginal distribution of every seat is uniform by construction, so
        // there is no rejection-sampling bias to get wrong, and it costs one op, not N.
        bytes32 yes = ebool.unwrap(e.asEbool(true));
        bytes32 no = ebool.unwrap(e.asEbool(false));

        bytes32[] memory guiltSeed = new bytes32[](suspects);
        bytes32[] memory liarSeed = new bytes32[](suspects);
        for (uint8 i = 0; i < suspects; i++) {
            guiltSeed[i] = i == 0 ? yes : no;
            liarSeed[i] = i < liars ? yes : no;
        }

        elist guiltList = e.shuffle(e.newEList(guiltSeed, ETypes.Bool));
        elist liarList = e.shuffle(e.newEList(liarSeed, ETypes.Bool));

        for (uint8 i = 0; i < suspects; i++) {
            ebool g = e.getEbool(guiltList, uint16(i));
            // Red John always lies. One encrypted OR welds guilt to dishonesty, which is
            // also why the true liar count is `liars` or `liars + 1` and the player can
            // never take an exact parity check on the liar population.
            ebool l = e.or(e.getEbool(liarList, uint16(i)), g);

            _guilt[caseId][i] = g;
            _liar[caseId][i] = l;
            e.allowThis(g); // persist across turns — without this the case is unplayable
            e.allowThis(l);
        }

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
            openedAt: uint64(block.timestamp)
        });

        casesPlayed[msg.sender] += 1;

        emit CaseOpened(caseId, msg.sender, suspects, liars, focus, turnAt);
    }

    /**
     * @notice Ask witness `witness`: "is the killer one of these people?", where `mask` is
     *         a plaintext bitmask over seats.
     *
     * @dev    `mask` is deliberately public. *Which* suspects you asked about is
     *         information an opponent and a spectator are entitled to see — that asymmetry
     *         (public question, private answer) is the game. Only the answer is granted.
     *
     *         Not payable: no operation in this function charges an Inco fee.
     */
    function interrogate(uint256 caseId, uint8 witness, uint16 mask) external returns (bytes32 answerHandle) {
        Case storage c = cases[caseId];
        if (c.status != Status.Open) revert WrongStatus();
        if (c.detective != msg.sender) revert NotYourCase();
        if (witness >= c.suspects) revert BadWitness();

        uint16 full = uint16((1 << c.suspects) - 1);
        if (mask == 0 || mask > full) revert BadMask();

        uint8 cost = mask == full ? CONTROL_COST : QUESTION_COST;
        if (c.focusLeft < cost) revert NoFocusLeft();
        c.focusLeft -= cost;

        // Is the killer inside the questioned set? Folded entirely in encrypted state.
        ebool truth = e.asEbool(false);
        for (uint8 i = 0; i < c.suspects; i++) {
            if ((mask >> i) & 1 == 1) {
                truth = e.or(truth, _guilt[caseId][i]);
            }
        }

        // ── The encrypted lie.
        // The witness's honesty bit flips the answer, in-enclave, without either secret
        // ever becoming branchable. There is no if/else here and there cannot be: `truth`
        // and `liar` are handles, not booleans.
        ebool answer = e.xor(truth, _liar[caseId][witness]);

        e.allow(answer, msg.sender); // selective reveal — the detective, and nobody else
        e.allowThis(answer);

        uint16 qid = c.questionsAsked;
        _testimony[caseId][qid] = answer;
        c.questionsAsked = uint8(qid + 1);

        answerHandle = ebool.unwrap(answer);
        emit Interrogated(caseId, msg.sender, qid, witness, mask, cost, answerHandle);

        // ── Red John reacts.
        // On harder cases he reaches the witness you just used and turns them: their
        // honesty bit is negated *in place*. Encrypted state mutates, so intelligence you
        // gathered three moves ago silently goes stale. A zk commitment cannot do this —
        // the commitment is frozen — and a trusted server doing it would *be* the game.
        if (c.turnAt != 0 && !c.turned && c.questionsAsked >= c.turnAt) {
            ebool flipped = e.not(_liar[caseId][witness]);
            _liar[caseId][witness] = flipped;
            e.allowThis(flipped);
            c.turned = true;
            emit WitnessTurned(caseId, witness);
        }
    }

    /**
     * @notice Name Red John. Free, and it ends the case.
     * @dev    Reveals every seat's guilt and honesty bit: the case is over, so full
     *         disclosure is the intended post-mortem rather than a leak. The frontend
     *         pulls all of them in a single `attestedReveal` batch and paints the board.
     */
    function accuse(uint256 caseId, uint8 seat) external {
        Case storage c = cases[caseId];
        if (c.status != Status.Open) revert WrongStatus();
        if (c.detective != msg.sender) revert NotYourCase();
        if (seat >= c.suspects) revert BadSeat();

        bytes32[] memory guiltHandles = new bytes32[](c.suspects);
        bytes32[] memory liarHandles = new bytes32[](c.suspects);
        for (uint8 i = 0; i < c.suspects; i++) {
            ebool g = _guilt[caseId][i];
            ebool l = _liar[caseId][i];
            e.reveal(g);
            e.reveal(l);
            guiltHandles[i] = ebool.unwrap(g);
            liarHandles[i] = ebool.unwrap(l);
        }

        c.accusedSeat = seat;
        c.status = Status.Accused;
        verdictHandle[caseId] = guiltHandles[seat];

        emit Accused(caseId, msg.sender, seat, guiltHandles[seat], guiltHandles, liarHandles);
    }

    /**
     * @notice Close the case by submitting the covalidator attestation for your verdict.
     * @dev    Model A settlement: the *contract* decides whether you were right, because
     *         a streak (and, with the Megapot layer, tickets) rides on the answer. The
     *         handle-match check is load-bearing — a signature alone only proves the TEE
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
    function testimony(uint256 caseId, uint16 questionId) external view returns (ebool) {
        return _testimony[caseId][questionId];
    }

    function getCase(uint256 caseId) external view returns (Case memory) {
        return cases[caseId];
    }

    /// @notice The full-lineup mask for a case — the control question.
    function controlMask(uint256 caseId) external view returns (uint16) {
        return uint16((1 << cases[caseId].suspects) - 1);
    }

    /// @dev Accept sponsorship so a case's Inco fee can be pre-funded rather than charged
    ///      to the player on every open.
    receive() external payable {}
}
