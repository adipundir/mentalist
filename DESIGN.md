# MENTALIST

**A confidential deduction game for the Inco Summer Game Jam 2026.**

> Nine suspects. One is Red John. Everyone lies — but Red John *always* lies.
> You have six units of Focus. Read the room.

---

## 0. The one-paragraph pitch

`MENTALIST` is an on-chain deduction game where the evidence itself is encrypted. A case
file is dealt by the TEE — nobody, *including the deployer*, knows who the killer is. You
interrogate witnesses by asking yes/no questions about subsets of the lineup. Every answer
is computed **inside** encrypted state and passed through that witness's hidden honesty
bit, so testimony can be a lie and you cannot tell which. The chain sees *what you asked*.
Only you see *what you were told*. The whole game is one line of Solidity that no
transparent blockchain can execute:

```solidity
ebool answer = e.xor(truth, liarBit);   // the encrypted lie
```

---

## 1. Why this wins the Inco track

The Inco track is judged on four equal criteria. This design targets each one directly.

| Criterion (25% each) | How `MENTALIST` scores |
|---|---|
| **Hidden mechanics** | The game is *unplayable* in plaintext. Not "private for privacy's sake" — the hidden honesty bit is the entire strategic surface. Reveal it and there is no game. |
| **Completeness** | Ships playable, solo, no opponent needed, no lobby, no faucet gymnastics. A judge can play a full case in 90 seconds from a cold browser. |
| **Creativity** | Nobody has built "the encrypted lie." Existing confidential games hide *cards*, *boards*, or *roles* — static secrets. This hides the **truthfulness of a computation**, which is a genuinely new use of encrypted compute. |
| **Fun** | It's Mastermind with an unreliable narrator. The "aha" (the control question) is discoverable in one play and permanently changes how you play. |

### The specific novelty claim

Inco's own catalogue of confidential-game archetypes covers hidden boards, hidden hands,
hidden roles, sealed bids, simultaneous moves, RNG settlement, and guess-and-match. Every
one of them hides a **value**. `MENTALIST` hides a **transformation**: the answer you
receive is a function of a secret you are trying to learn *and* a second secret that
corrupts your measurement of the first. That's an encrypted noisy channel, and it is the
first mechanic on this list that a commit-reveal scheme cannot emulate at any cost —
commit-reveal would have to open the honesty bit to prove the answer was computed
honestly, which is precisely the information the game is about.

---

## 2. The game

### 2.1 Setup (one transaction)

A case is dealt entirely by the TEE:

- **N suspects** (9 in the standard case) laid out as dossier cards.
- Exactly **one** is Red John — placed by `e.shuffle` over a list of `[1 × true, N-1 × false]`.
  The randomness lives in the *permutation*, so the placement is uniform by construction
  and no one — player, deployer, chain observer — can predict it.
- **K of them are liars** (3 in the standard case) — an independent `e.shuffle`.
- **Red John is forced to lie**: `liar[i] = e.or(liar[i], guilt[i])`.
  One encrypted OR. So the true liar count is K or K+1, and *you don't know which* —
  which is a feature: it denies you an exact parity check on the liar population.

### 2.2 The move

You spend **Focus** (6 in the standard case) on interrogations. One interrogation is:

> **Witness `w`** — "Is the killer one of *these* people?" (a subset `S` of the lineup)

The contract computes, without ever leaving encrypted state:

```solidity
ebool truth = FALSE;
for (i in S) truth = e.or(truth, guilt[i]);   // is the killer in S?
ebool answer = e.xor(truth, liar[w]);         // ...as filtered through w's honesty
e.allow(answer, msg.sender);                  // only the detective may decrypt it
```

`e.allow` — not `e.reveal`. The **question is public** (it's in the event log, and in a
duel your opponent watches you ask it). The **answer is yours alone**. That asymmetry is
the game's spine.

### 2.3 The three questions that matter

The strategy space collapses into three archetypal questions, and discovering them is the
learning curve:

**1. The control question** — `S = everyone`.
The killer is *always* among all N suspects, so the truth is always `TRUE`. The answer is
therefore `NOT liar[w]`, exactly. **This is a perfect, 100%-reliable honesty test.** It is
also literally the interrogator's technique it's named after: *ask a question you already
know the answer to*. Costs 2 Focus.

**2. The split** — `S = about half the board`.
A binary search. Worth a full bit **if and only if** you know the witness's honesty. Costs
1 Focus.

**3. The self-incrimination** — `S = {w}`, asking a witness about themselves.
| Witness is… | truth | liar | answer |
|---|---|---|---|
| innocent + honest | false | 0 | **NO** |
| innocent + liar | false | 1 | **YES** |
| Red John | true | 1 (forced) | **NO** |

A **YES is proof of an innocent liar** — it both exposes a liar and clears them. A NO is
weak evidence of honesty. Costs 1 Focus.

### 2.4 Why a known liar is as good as an honest witness

This is the elegant part. Once a control question tells you witness `w` lies, `w` becomes a
*perfect oracle* — just invert everything they say. So a control question is never wasted;
it always converts a witness into a usable instrument. The tension isn't "did I waste a
move," it's **"can I afford the 2 Focus to be certain, or do I gamble the 1?"**

### 2.5 The Focus economy is deliberately tight

Standard case: **N = 9, K = 3, Focus = 6.**

- Safe line: control (2) + four splits (4) = **exactly 6**. Zero slack. Perfect play wins.
- Greedy line: skip the control, trust a witness blind (~61% they're honest), spend 5–6 on
  splits and keep a Focus in reserve.

There is no dominant strategy, and perfect play requires correct bookkeeping *under
inversion* — which is exactly where humans make mistakes under time pressure. The board is
re-dealt every case, so it's a fresh puzzle, not a solved one.

### 2.6 The accusation

Free. Ends the case. Correct → the dossier flips, the red smiley stamps across the board.
Wrong → your streak dies.

---

## 3. Difficulty ladder and replay

| Case | Suspects | Liars | Focus | Twist |
|---|---|---|---|---|
| 1 — *The Warm-Up* | 6 | 1 | 5 | tutorial; the control question is signposted |
| 2 — *The Lineup* | 9 | 3 | 6 | standard |
| 3 — *Cold Case* | 12 | 5 | 7 | — |
| 4 — *The Blind Spot* | 9 | 3 | 6 | **Red John turns a witness mid-case** |
| 5 — *Tyger Tyger* | 12 | 5 | 7 | turned witness + no control question allowed |

**Case 4's twist is the second Inco-only mechanic.** After your third question, Red John
intimidates a witness: `liar[w] = e.not(liar[w])`. Encrypted state **mutates in place**.
Your control question from turn 1 is now stale — information *decays*. A zk commitment
can't do this (the commitment is frozen); a trusted server can, but then the server is the
game. This is the clearest demonstration in the project of Inco's actual architectural
advantage over the alternatives, and it's worth calling out explicitly in the demo video.

---

## 4. Megapot integration (core loop, not a link-out)

Thematically: Patrick Jane was a con man before he was a consultant. The jackpot is the
long shot — the one case nobody solves.

- **Entry.** A case costs a small USDC stake. That stake buys a **Megapot ticket** through
  `purchaseTickets(referrer, value, recipient)` with the game treasury as referrer.
  Playing *is* entering the draw.
- **Efficiency pays.** Unspent Focus at the moment you close a case converts to **extra
  tickets**. Solving in 4 Focus instead of 6 literally buys you two more shots at the
  jackpot. This is what makes the tight Focus economy matter beyond bragging rights — the
  skill ceiling has a payout curve attached.
- **The treasury is self-funding.** Megapot's referral fee (10% of ticket sales routed to
  the referrer) accrues back to the game contract and funds case prizes. The game pays for
  itself out of the lottery it feeds.

> **Track selection.** The jam requires choosing one track. The hidden mechanics are the
> soul of this build, so the primary submission is the **Inco track**. The Megapot layer is
> built and demonstrated regardless — it strengthens *Completeness* and *Creativity* on the
> Inco rubric, and if the organisers permit a second submission it stands on its own
> against the Megapot rubric (depth of integration 30%, gameplay 25%, working product 25%,
> retention 20%).

---

## 5. Architecture

```
┌──────────────────────────── frontend (Next.js 15 + wagmi) ────────────────────────────┐
│  corkboard  ·  dossier cards  ·  the logic grid  ·  red string                        │
│                                                                                       │
│  openCase() ──tx──► ┌───────────────────────────────┐                                 │
│  interrogate() ─tx─►│      Mentalist.sol            │                                 │
│  accuse() ─────tx──►│                               │                                 │
│                     │  guilt[]  ebool  (shuffled)   │──── e.allow(answer, detective)  │
│                     │  liar[]   ebool  (shuffled)   │           │                     │
│                     │  answer = xor(truth, liar[w]) │           ▼                     │
│                     └───────────────────────────────┘   attestedDecrypt (Loop B)      │
│                                    │                     popup-free via session       │
│                                    │ e.reveal(verdict)   voucher                      │
│                                    ▼                                                  │
│                          attestedReveal (no signature) ──► settle() Model A ──► payout │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Which loop, where

The game deliberately uses **both** Inco reveal models, each where it belongs:

- **Loop B (private decrypt)** for testimony. Only the detective learns an answer. Read
  with `attestedDecryptWithVoucher` behind a once-per-session allowance voucher, so
  interrogating costs **one wallet popup for the move and nothing else**.
- **Loop A (public reveal) + Model A settlement** for the verdict. The accusation's
  correctness is money-touching (streak, Megapot tickets), so it goes through
  `e.reveal` → covalidator attestation → on-chain `isValidDecryptionAttestation` with a
  handle-match check. The contract, not the client, decides whether you were right.

### 5.2 Fee model — the good news

Only `openCase` charges Inco fees (two `newEList` + two `shuffle`). `interrogate` runs
`getEbool`, `e.or`, `e.xor`, `e.allow` — **none of which charge an Inco fee**, verified
against `@inco/lightning@1.0.0` source. So the moment-to-moment loop is an ordinary cheap
Base transaction. The case-open fee is **sponsored from the contract balance**, making the
whole session gasless-feeling apart from Base's own gas.

### 5.3 Contract surface

```solidity
function openCase(uint8 suspects, uint8 liars, uint8 focus) external payable returns (uint256 caseId);
function interrogate(uint256 caseId, uint8 witness, uint16 mask) external;   // not payable
function accuse(uint256 caseId, uint8 seat) external;                        // reveals verdict
function settle(uint256 caseId, DecryptionAttestation calldata a, bytes[] calldata sigs) external;
```

`mask` is a plaintext N-bit subset. Plaintext is correct here: *which* suspects you asked
about is public by design — it's what an opponent (and a spectator) is entitled to see.

---

## 6. The look

Genre-true, per Inco's own frontend guidance for social deduction: **dossiers and redaction
bars.** Deep charcoal, aged-paper cards, one blood red. Typewriter mono for testimony,
condensed serif for names. Film grain over everything. No purple gradients, no emoji icons.

The reveal window (~350 ms fast path, seconds on the slow path) is spent *in fiction*: the
dossier card trembles, the polygraph needle sweeps, and the answer stamps in — `TRUTH?` /
`LIE?` — never a spinner. Latency becomes suspense, which in a deduction game is the
product.

**The logic grid** is the real interface: a persistent transcript of every question, every
answer, and every witness's proven honesty state, with contradictions auto-highlighted in
red string. Players don't hold this in their head — the UI is the detective's notebook.

---

## 7. Honest framing

Inco is **TEE-based, not FHE**, and "provably fair" here means an **Intel TDX enclave
attestation signed by the covalidator** — not a zero-knowledge proof. The claim this game
makes is real and worth making: the deployer genuinely cannot know who Red John is,
because the placement happens inside the enclave and no plaintext ever touches the chain.
But it is a hardware trust assumption, and the README and the demo video say so plainly.
