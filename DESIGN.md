# MENTALIST

**A confidential deduction game for the Inco Summer Game Jam 2026.**

> **Superseded, kept for the record.** This document describes the interrogation design: a
> case dealt per player by the TEE, one statement per witness passed through a hidden honesty
> bit, `e.xor(truth, liarBit)`, settled by `Mentalist.sol`. The shipped game is not that. It
> is seven hand-written cases whose alibis are public in `frontend/lib/casebook.ts`, exactly
> one of which is logically impossible, with the impossible speaker's id encrypted once into
> `Mentalist.sol` and compared against each player's encrypted bet by `e.eq`. Nothing in
> sections 0, 2.1, 2.2, 5 or 5.3 below is in the play path. **`README.md` is the current
> description.** Section 3 (the seven cases) and section 4 (Megapot) still hold, except that
> every shipped case has exactly one liar rather than the one to four in the section 3 table.

> Nine suspects. One is Red John. Everyone lies, but Red John *always* lies.
> Everyone in this room knows who did it. Not all of them will tell you.

---

## 0. The one-paragraph pitch

`MENTALIST` is an on-chain deduction game where the evidence itself is encrypted. A case
file is dealt by the TEE, nobody, *including the deployer*, knows who the killer is. You
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
| **Hidden mechanics** | The game is *unplayable* in plaintext. Not "private for privacy's sake", the hidden honesty bit is the entire strategic surface. Reveal it and there is no game. |
| **Completeness** | Ships playable, solo, no opponent needed, no lobby, no faucet gymnastics. A judge can play a full case in 90 seconds from a cold browser. |
| **Creativity** | Nobody has built "the encrypted lie." Existing confidential games hide *cards*, *boards*, or *roles*, static secrets. This hides the **truthfulness of a computation**, which is a genuinely new use of encrypted compute. |
| **Fun** | It's Mastermind with an unreliable narrator. The "aha" (the control question) is discoverable in one play and permanently changes how you play. |

### The specific novelty claim

Inco's own catalogue of confidential-game archetypes covers hidden boards, hidden hands,
hidden roles, sealed bids, simultaneous moves, RNG settlement, and guess-and-match. Every
one of them hides a **value**. `MENTALIST` hides a **transformation**: the answer you
receive is a function of a secret you are trying to learn *and* a second secret that
corrupts your measurement of the first. That's an encrypted noisy channel, and it is the
first mechanic on this list that a commit-reveal scheme cannot emulate at any cost, commit-reveal would have to open the honesty bit to prove the answer was computed
honestly, which is precisely the information the game is about.

---

## 2. The game

### 2.1 Setup (one transaction)

A case is dealt entirely by the TEE:

- **N suspects** (between 3 and 8, depending on the case) standing in the room it happened in.
- Exactly **one** is Red John, placed by `e.shuffle` over a list of `[1 × true, N-1 × false]`.
  The randomness lives in the *permutation*, so the placement is uniform by construction
  and no one, player, deployer, chain observer, can predict it.
- **K of them are liars** (between 1 and 4, depending on the case): an independent `e.shuffle`.
- **Red John is forced to lie**: `liar[i] = e.or(liar[i], guilt[i])`.
  One encrypted OR. So the true liar count is K or K+1, and *you don't know which*, which is a feature: it denies you an exact parity check on the liar population.

### 2.2 The move

You click one suspect. That is the entire input.

Each of them has exactly one statement in him, and it is always about the same fixed set of
other suspects, decided when the case was written rather than when it was dealt. The contract
computes, without ever leaving encrypted state:

```solidity
ebool truth  = e.or(guilt[s] for s in S);   // is the killer inside that set?
ebool answer = e.xor(truth, liar[w]);       // ...as filtered through w's honesty
e.allow(answer, msg.sender);                // and only the detective may read it
```

**The words are scripted. The direction is not.** If he lies, the sentence comes out
inverted, and nothing about the delivery tells you which happened. That single `xor` is the
whole game: what you are told is the truth about a secret you are hunting, corrupted by a
second secret you also cannot see.

### 2.3 Why there is no question builder any more

An earlier draft let the player assemble the set: pick a witness, then click others to build
a bitmask, then press ask, on a budget called Focus. It was a query builder wearing an
interrogation's clothes. Nobody guessed it, and it buried a mechanic that is genuinely one
sentence long.

Fixing the sets costs less than it looks. The player never had private information when
choosing them, so removing the choice removes bookkeeping, not strategy. What remains is the
part that was always the game: hearing a room of contradictory statements and working out
which of them are inverted.

### 2.4 Who each man speaks about is searched, not authored

The claim masks are not chosen by taste. For each case, every candidate assignment is scored
by exhaustive enumeration over the dealer's entire world set, and the one that leaves the
fewest suspects standing wins.

This matters because the statements have to constrain each other. Given the observed answers,
each candidate killer *forces* every suspect's honesty: if he did it, then whoever put him
inside their set is telling the truth and whoever cleared him is lying. A candidate survives
only if the liar count that implies is one the dealer could have produced, and if the
candidate is himself among the liars. Badly chosen sets leave that system underdetermined
and the room becomes a coin flip.

### 2.5 What the deduction actually costs you

Nothing, in resources. Everyone speaks once, so there is no budget to mismanage and no
dominant line to memorise. The cost is attention: the answers must be tracked *under
inversion*, which is exactly where humans slip.

The room does the arithmetic with you. The notebook narrows the candidate list from the
statements you legitimately hold, and never reads hidden state. What it cannot do is decide
for you when two men are still standing.

### 2.6 The accusation

Free. Ends the case. Correct → the dossier flips, the red smiley stamps across the board.
Wrong → your stake belongs to whoever read the room correctly.

---

## 3. Difficulty ladder and replay

Seven cases, following the real arc, one released per day. The lineup shrinks the way the
suspect list does and the proportion of liars climbs, so the later rooms are mostly hostile.

| Case | Suspects | Liars | Typical candidates left |
|---|---|---|---|
| I, *Cinnabar Sunday* | 4 | 1 | 1.25 |
| II, *The Vermilion Hour* | 6 | 2 | 1.82 |
| III, *Oxblood Handshake* | 8 | 3 | 2.19 |
| IV, *Seven Shades of Crimson* | 7 | 3 | 2.34 |
| V, *Carmine on Her Cheek* | 6 | 4 | 1.73 |
| VI, *Claret and Brimstone* | 5 | 4 | 1.16 |
| VII, *Sanguine* | 3 | 2 | 1.44 |

**Difficulty is not the same as ambiguity.** The last column is the average number of
suspects still standing once every statement is in, measured by exhaustive enumeration over
the dealer's whole world set. It does not climb monotonically, because a room with almost
nobody honest is *informative*: when four of six are lying, the pattern of lies is itself a
constraint. The hardest rooms to be certain in are the middle ones.

That residual ambiguity is the design, not a defect. A case that always resolved to one man
would make the market pointless, since everyone who did the arithmetic would win and split
the pot evenly. Sometimes you have to bet.

**What was cut.** Earlier drafts had a Focus budget, a control question, and a turncoat that
flipped a witness mid-case with `liar[w] = e.not(liar[w])`. All three are gone. The turncoat
was the better Inco demonstration and the worse game: with one statement per suspect there
is nothing left to re-ask, so silently invalidating a statement was pure noise. The contract
still implements it, and every round is configured with it switched off.
Your control question from turn 1 is now stale, information *decays*. A zk commitment
can't do this (the commitment is frozen); a trusted server can, but then the server is the
game. This is the clearest demonstration in the project of Inco's actual architectural
advantage over the alternatives, and it's worth calling out explicitly in the demo video.

---

## 4. Megapot integration (core loop, not a link-out)

Thematically: Patrick Jane was a con man before he was a consultant. The jackpot is the
long shot, the one case nobody solves.

> **Correction to an earlier draft.** This section was originally written against
> `purchaseTickets(referrer, value, recipient)`: the **V1 `BaseJackpot` API**, which is
> archived at `v1.docs.megapot.io` and is a different, incompatible protocol. The current
> contracts are `Jackpot` + `JackpotRandomTicketBuyer`, verified live by RPC (details in
> §4.2). Building on V1 would have been a visible red flag against a rubric that weights
> *depth of integration* at 30%.

### 4.1 The mechanic

- **Conviction pays, twice.** Every player stakes USDC into one pot per case. Name the right
  man inside your twenty minutes and you are on the winning side; miss, or run out of clock,
  and your stake stays. When the round closes the winners split **the whole pot in proportion
  to what each of them staked**, paid as real Megapot tickets bought for their wallets. So
  being right pays, and having been sure enough to back it pays again.
- **A pool, not a book.** Fixed odds would need a bookmaker with a balance sheet, and any
  multiplier the contract set would be a number someone invented. A pari-mutuel pool prices
  itself and can never be insolvent, because it only ever pays out what it already holds.
- **The losers fund the tickets.** Megapot's buyer takes a recipient and a referrer as
  separate arguments, so the market buys for the winner's wallet while naming itself
  referrer. Nothing is minted from nowhere: `Mentalist` is the payer
  and the player is the recipient, so someone who has never held USDC still walks away
  holding a genuine lottery ticket NFT.
- **The tickets pay for themselves.** `CaseRewards` passes itself as the `_referrers`
  entry, earning the protocol referral fee (currently 10% of ticket price at purchase, plus
  a share of referred winnings at claim). Those fees accrue inside the Jackpot and
  `sweepReferralFees()` pulls them back into the treasury that funds the next round of
  rewards. The loop closes.

### 4.2 The integration facts that matter

Every value below was confirmed against Base Sepolia by direct RPC, not read off a docs
page, two research passes disagreed about whether a V2 testnet deployment even existed, so
it was settled against the chain.

| | Base Sepolia | Base mainnet |
|---|---|---|
| `Jackpot` | `0x465dA3c859f193A3807386387bEE941B2A4c3279` | `0x3bAe643002069dBCbcd62B1A4eb4C4A397d042a2` |
| `JackpotRandomTicketBuyer` | `0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746` | `0xb9560b43b91dE2c1DaF5dfbb76b2CFcDaFc13aBd` |
| Ticket token | Circle USDC `0x036CbD…dCF7e` (6dp) | Circle USDC `0x833589…02913` (6dp) |
| Ticket price | **0.01 USDC** | 1.00 USDC |
| Drawing cadence | **30 minutes** | 24 hours |

Three things this buys the build:

1. **A demo can show a complete cycle.** Thirty-minute testnet drawings mean buy → draw →
   settle → claim fits inside a single sitting. On mainnet you would wait a day.
2. **Rewards cost cents.** At 0.01 USDC a ticket, a full evening of playtesting is under a
   dollar.
3. **Nothing is hardcoded that shouldn't be.** `CaseRewards` reads the jackpot and the
   ticket token *off the buyer contract at construction*, and the ticket price live on every
   claim. Megapot runs different tokens per network and a legacy testnet deployment on a
   mock token; assuming any of it is how integrations break.

**The single easiest thing to get wrong:** `_referralSplitBps` is 1e18-scaled and must sum
to exactly `1e18`, despite the name. Passing basis points silently mis-splits the fee.
`CaseRewards.FULL_REFERRAL_SPLIT` is `1e18` with a comment saying exactly this.

> **Track selection.** The jam requires choosing one track. The hidden mechanics are the
> soul of this build, so the primary submission is the **Inco track**. The Megapot layer is
> built and demonstrated regardless, it strengthens *Completeness* and *Creativity* on the
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

### 5.2 Fee model, the good news

Only `openCase` charges Inco fees (two `newEList` + two `shuffle`). `interrogate` runs
`getEbool`, `e.or`, `e.xor`, `e.allow`, **none of which charge an Inco fee**, verified
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
about is public by design, it's what an opponent (and a spectator) is entitled to see.

---

## 6. The look

Genre-true, per Inco's own frontend guidance for social deduction: **dossiers and redaction
bars.** Deep charcoal, aged-paper cards, one blood red. Typewriter mono for testimony,
condensed serif for names. Film grain over everything. No purple gradients, no emoji icons.

The reveal window (~350 ms fast path, seconds on the slow path) is spent *in fiction*: the
dossier card trembles, the polygraph needle sweeps, and the answer stamps in, `TRUTH?` /
`LIE?`: never a spinner. Latency becomes suspense, which in a deduction game is the
product.

**The logic grid** is the real interface: a persistent transcript of every question, every
answer, and every witness's proven honesty state, with contradictions auto-highlighted in
red string. Players don't hold this in their head, the UI is the detective's notebook.

---

## 7. Honest framing

Inco is **TEE-based, not FHE**, and "provably fair" here means an **Intel TDX enclave
attestation signed by the covalidator**, not a zero-knowledge proof. The claim this game
makes is real and worth making: the deployer genuinely cannot know who Red John is,
because the placement happens inside the enclave and no plaintext ever touches the chain.
But it is a hardware trust assumption, and the README and the demo video say so plainly.
