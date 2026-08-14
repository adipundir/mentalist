# MENTALIST

**Seven rooms. A body in each one. Everybody gives an account of themselves, and exactly one of those accounts cannot be true.**

Live: **https://mentalist-cases.vercel.app**
Source: **https://github.com/adipundir/mentalist**

A confidential prediction market on Base Sepolia, built for the Inco x Megapot Summer Game Jam 2026, adapted from the Red John arc of *The Mentalist*.

You walk into a room, listen to everyone in it, work out which one is describing something that could not have happened, and stake USDC on that person. Everyone who names the right person splits the whole pot in proportion to what they staked, paid out as real Megapot lottery tickets bought with the money of everyone who was wrong.

---

## The game

Seven hand-written cases. Each case is a room containing a body and a number of people. Every case is a different room, and the rooms are different sizes: the smallest holds three people, the largest eight.

| Case | Title | Room | People |
|---|---|---|---|
| I | Cinnabar Sunday | a shuttered Sunday parlour | 4 |
| II | The Vermilion Hour | a shuttered safe house | 6 |
| III | Oxblood Handshake | a half dead mall food court | 8 |
| IV | Seven Shades of Crimson | a shuttered hotel lounge | 7 |
| V | Carmine on Her Cheek | a dance hall's dirt cellar | 6 |
| VI | Claret and Brimstone | the parlour where it happened | 5 |
| VII | Sanguine | a chapel beside the graves | 3 |

Every case is a separate murder with its own killer. They are signed the same way, a smiling face drawn in the victim's blood, which is why each of them gets called a Red John. Nothing carries from one case to the next: the cast changes, the room changes, and solving one tells you nothing about another.

Each person in the room gives exactly one spoken alibi. Exactly one of those alibis is logically **impossible**, and that person is the killer. Not suspicious, not shifty, not evasive: impossible. From Chapter VII, in the vestry of a chapel:

> I shut myself in the vestry when the rain started and I bolted the door behind me. Nobody else in there the whole hour, just me and that little board they keep by the stove, and I got beaten before the candle was half down, which tells you exactly what kind of night I was having.

Chess takes two. There was nobody on the other side of the board.

The other six cases run on the same principle with different shapes: asleep for a whole hour and also certain nobody came up the stairs, bolted alone behind a door and also standing over the body outside it, standing third in a queue with nobody else in the building, three miles on foot in four minutes, upstairs with the trapdoor shut and also watching what happened at the bottom of the steps, a phone call made on a line that has been dead since Tuesday.

The loop is:

1. Click a person. They talk. This is free: no transaction, no signature, nothing on chain.
2. Hear out as many of them as you want, in any order.
3. Work out which account cannot be true.
4. Stake USDC on that person.

---

## Where Inco is load bearing

Inco is **TEE-based confidential compute** running on Intel TDX. It is **not FHE** and it is **not zero knowledge**. "Secret" here means the value is decrypted and operated on inside an enclave. "Provably fair" here means a covalidator attestation, not a zk proof. That is a hardware trust assumption and it is worth stating plainly rather than dressing up.

**The alibis are public.** Every word every person says is in `frontend/lib/casebook.ts`, in the repository, where anyone can read them. That is deliberate: they are content, and content belongs in the repo.

**What is secret is which person gives the impossible alibi.** That is the answer, and it is the only thing worth hiding.

The design in `contracts/contracts/Mentalist.sol`:

- The case author encrypts the killer's person id on their own machine from local env and hands the contract a ciphertext. `openCase` ingests it straight into an `euint256`, folds it into `0..suspects-1` so no author can seal a seat nobody sits at, and calls `e.allowThis`. The plaintext person id is never in calldata, never in a log, and not committed to the repository.
- A player calls `stake` with their USDC amount and their own encrypted person id.
- The contract compares the two inside the enclave with `e.eq(named, _answer[caseId])`, gets an `ebool`, and keeps it with `e.allowThis`. The handle is stored in `verdictHandle` so the contract knows exactly which ciphertext that player must later open. It does **not** grant that bit to the player yet, which is the part worth being careful about: an Inco grant is persistent and live the moment the transaction confirms, and the covalidator decrypts on the strength of the on-chain ACL alone. Granting at stake time would have put the answer on sale for the minimum bet, one throwaway wallet per seat.
- Once the case closes, the player calls `unseal` and *then* gets the grant. That call is the timing: refusing an early filing refuses nothing, because a player who could already read the bit would simply wait and file later, having spent the round knowing.
- The player then files a `DecryptionAttestation` over their own verdict bit. `resolve` checks the handle matches the one it stored, then verifies the covalidator signatures through `inco.incoVerifier().isValidDecryptionAttestation`. The contract rules on who won, not the client.

So the answer is not public while money can still move, and it is not revealed by the contract. A spectator watching the chain sees stakes arriving and cannot tell who anyone backed, which means they cannot watch the informed money and copy it.

**What none of this buys is a correct author.** `rem` forces the sealed id onto a seat that exists, and nothing on chain can go further than that: no contract can check that the sealed id belongs to the person whose alibi is impossible. An operator who sealed the wrong name and staked on it would look exactly like someone who guessed well. The answer being immutable is a real guarantee; the answer being right rests on the author.

**Why not commit-reveal.** Two reasons, both fatal. The operator would have to hold the answer until settlement, which means they could change it. And a hash commitment over a person id drawn from a range of 3 to 8 is brute forced instantly. The answer has to be *usable* while still secret, because the contract has to compare against it. That is what a TEE gives and a hash does not.

---

## The market

Pari-mutuel, one pot per case.

- Stake between 0.10 and 5.00 USDC, one entry per wallet per case.
- Winners split the **whole** pot in proportion to stake: `pot * yourStake / totalWinningStake`. Being right pays once for being right and once for how much you were willing to put behind it.
- Payout is in real **Megapot tickets**, bought for the winner's wallet with the losers' stakes. Batched in tens, up to a hundred tickets per payout, which is a bound on the gas of a single transaction rather than a statement about the share. Whatever the ceiling and the ticket price leave over goes back to the player as USDC rather than being kept by the house. At the 0.01 USDC that Base Sepolia quotes, that ceiling is worth one dollar of tickets, so on a real winning share most of the money arrives as cash: see the note under *What this does not do yet*.
- If nobody names him, every entrant lost their read. The no-winner pot is released from reserved funds and becomes house surplus; no refund path remains.

Pari-mutuel rather than fixed odds because fixed odds need a bookmaker with a balance sheet, and any multiplier this contract set would be a number somebody invented. A pool sets its own price and can never be insolvent: it only ever pays out what it already holds.

Two Megapot facts that cost time to establish, both confirmed against the chain by RPC rather than read off a docs page:

- The live protocol is **V2** (`Jackpot` plus `JackpotRandomTicketBuyer`). The V1 `BaseJackpot` / `purchaseTickets` API that fills every search result is archived and incompatible.
- `_referralSplitBps` is **1e18-scaled** despite the name, and must sum to exactly `1e18`. Passing basis points silently mis-splits the fee. `FULL_REFERRAL_SPLIT` is `1e18` with a comment saying why.

Nothing else about Megapot is hardcoded: the jackpot address and the ticket token are read off the buyer contract at construction, and the ticket price is read live on every payout.

---

## Status

Honest accounting, because it matters.

- The frontend and operational scripts point at the hardcoded Base Sepolia `Mentalist` address in `frontend/lib/addresses.ts`.
- `contracts/scripts/deploy.ts` deploys `Mentalist`, encrypts each answer from local `MENTALIST_ANSWER_IDS`, and opens all seven cases. The answer ids stay in ignored env, not in the repo.
- `/api/keeper` files verdicts and settles closed rooms with the keeper key from Vercel env.
- `/api/tell` serves the settled reveal from server-only `MENTALIST_ANSWERS`, and only after the contract reports `settled`.

---

## What this does not do yet

- **Testnet only.** Base Sepolia, testnet USDC, Megapot's testnet jackpot. Real transactions, no real money. There is no mainnet deployment and no plan stated here for one.
- **The seven cases are fixed content, not generated.** Once you have solved a case you know its answer permanently, so each room is single-use per person. There is no procedural case generator.
- **Most of a winning share arrives as USDC, not as tickets.** `payout` buys at most `TICKETS_PER_BATCH * MAX_BATCHES` = 100 tickets, a bound on the size of one transaction. Megapot quotes 0.01 USDC a ticket on Base Sepolia, so that ceiling is worth 1.00 USDC and a 5.00 USDC share leaves as 100 tickets plus 4.00 in cash. Nothing is lost and nothing is kept, but the ticket half of the payout is capped at a dollar until the ceiling is recalibrated against the live price, which needs a redeploy.
- **The answer being immutable is not the answer being right.** `openCase` folds the sealed id onto a seat that exists and can check nothing else, and there is no reveal after settlement. An operator who sealed the wrong name and staked on it would be indistinguishable on chain from a lucky guess.
- **No audit.** These are jam contracts. `Mentalist.sol` has had no adversarial review beyond the author's.
- **The security claim rests on hardware.** If the TDX enclave or the covalidator set is compromised, the answer is readable. That is the honest boundary of what Inco provides.
- **Encrypted bets have mostly been exercised against the mock.** `Mentalist.stake` ingests the player's encrypted person id and compares it with `e.eq` inside the enclave. The suite covers that path, but live covalidator coverage is still limited.

---

## Tests

57 Foundry tests cover `contracts/contracts/Mentalist.sol`, including encrypted bets, owner rescheduling, keeper filing, settlement, and Megapot payout accounting.

```bash
cd contracts
forge test
```

The ones worth naming:

| Test | What it pins down |
|---|---|
| `test_ExactlyOneManIsLying` | exactly one person in the room gives a false account |
| `test_TheRoomIsUnreadableUntilYouOpenIt` | the answer cannot be read until its own player opens the room |
| `test_EveryManGetsHisOwnAccountAndOnlyTheLiarGetsTheTell` | no two people give the same account |
| `test_CannotRerollIntoAnEasierDeal` | a player cannot open cases until one is convenient and bet on that |
| `test_CannotRecordAfterTheRoundHasSealed` | results cannot join `winningStake` after the round seals and dilute shares already computed |
| `test_ReservedDrainsToZeroOnceWinnersArePaid` | payouts account exactly, with nothing stranded in the contract |
| `test_SubTicketRemainderGoesBackToThePlayer` | rounding dust returns to the winner rather than to the house |
| `test_OwnerCannotWithdrawAnotherRoundsStakes` | `withdrawSurplus` can only ever move referral fees and dust |
| `test_AnAnswerNoSeatHasIsFoldedBackIntoTheRoom` | the case author cannot seal an id nobody sits at and be the only possible winner |
| `test_MegapotBeingShutPaysTheShareOutInUsdcInstead` | a winner's money is not hostage to a third party's ticket-sales toggle |
| `test_AnUnevenSplitStillLeavesNothingBehind` | a pot that does not divide evenly still leaves `reserved` at zero |

Two notes on the harness, since they bound what the suite proves.

The dealer used to build an encrypted list and shuffle it, and Inco's in-process Foundry mock (v1.0.0) does not implement the elist operations that needs, so the suite ran against a substitute dealer and the real one was only ever exercised on a live network. It no longer does. `_deal` now places the impossible account with one `e.randBounded` draw and a row of comparisons, all of which the mock supports, so these tests run the production dealing code exactly as written. `_deal` is still `virtual` and nothing overrides it.

The other note is what makes any of it assertable: the mock hands the test a plaintext oracle. `get(handle)` reads a ciphertext in the clear, with `getBoolValue` and `getUint256Value` as typed wrappers over the same store, and `getDecryptionAttestation(requester, HandleWithProof)` mints an attestation on demand. Production code can do none of that, which is exactly the point, and it is why a green suite is evidence about the rules of the game rather than about the confidentiality claim.

---

## Running it locally

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

If `pnpm install` fails with `Host key verification failed`, that is the three git dependencies in the root `package.json` overrides (`forge-std`, `ds-test`, `@safe-global/safe-smart-account`) resolving over SSH. Rewrite them for one invocation:

```bash
GIT_CONFIG_COUNT=2 \
  GIT_CONFIG_KEY_0='url.https://github.com/.insteadOf' GIT_CONFIG_VALUE_0='ssh://git@github.com/' \
  GIT_CONFIG_KEY_1='url.https://github.com/.insteadOf' GIT_CONFIG_VALUE_1='git@github.com:' \
  pnpm install
```

Copy `frontend/.env.example` to `frontend/.env.local` and set the network config:

```
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=      # optional, adds mobile wallets
```

There is no offline mode. Without the right contract address the room paints and every account in it can be heard, because that is all public data, but the stake panel has no live case to read. A simulated case would be a different game.

To play you need two things in a Base Sepolia wallet: testnet USDC from [faucet.circle.com](https://faucet.circle.com), and a little test ETH for gas and for the Inco fee charged when a ciphertext is ingested. Listening to people costs nothing.

---

## Deploying

```bash
cd contracts
cp .env.sample .env          # set PRIVATE_KEY_BASE_SEPOLIA, BASE_SEPOLIA_RPC_URL, and MENTALIST_ANSWER_IDS
pnpm compile
pnpm deploy                  # deploys Mentalist, opens all seven cases
```

`pnpm deploy` deploys the contract, encrypts each case's answer locally from ignored env, and opens the case with it, because `openCase` is `onlyOwner` and a case nobody has opened is a row the board cannot take money for. After a new deployment, update the single hardcoded address in `frontend/lib/addresses.ts` before building the frontend and keeper.

Other scripts against the live chain:

```bash
MENTALIST_CASE=2 MENTALIST_OPEN_FOR=3600 pnpm reschedule
MENTALIST_CASE=2 MENTALIST_PICK=1 pnpm stake
```

---

## Repository layout

```
contracts/
  contracts/Mentalist.sol        the game: encrypted answers, encrypted bets,
                                 attested settlement, Megapot payouts
  contracts/Megapot.sol          Megapot interfaces used by the payout rail
  test-forge/Mentalist.t.sol     Foundry coverage for the game loop
  scripts/deploy.ts              deploys Mentalist and opens all seven cases
  scripts/reschedule.ts          owner-side closing-clock update
  scripts/stake.ts               live encrypted stake helper
frontend/
  lib/casebook.ts                the seven cases: rooms, rosters, every public alibi
  lib/canon.ts                   the cast, drawn to the character system
  lib/contracts.ts               the one address and the ABI fragments actually used
  lib/inco.ts                    the two confidential operations: seal a bet, attest a verdict
  lib/schedule.ts                one case a day from a fixed epoch
  lib/market.ts                  stake bounds and the case window
  lib/sound.ts                   the whole audio palette, synthesised at runtime
  lib/narrator.ts                the browser's own speech synthesis
  components/Scene.tsx           the case as it plays out, phase by phase
  components/Room.tsx            the room itself, and everyone standing in it
  components/Character.tsx       every person, as parameterised SVG
  components/CrimeScene.tsx      the crime scene, generated per case
  components/Stake.tsx           seal the name, approve, hand it to the casebook
  components/Settlement.tsx      file the verdict, record it, collect in tickets
DESIGN.md                        the superseded interrogation design, kept for the record
```

`frontend/lib/solver.ts`, `frontend/lib/oracle.ts`, `frontend/lib/script.ts` and `frontend/lib/chain-oracle.ts` belonged to the earlier design and are gone with it. `frontend/lib/suspects.ts` survives, because the cast did. `frontend/lib/story.ts` was never one of them: the chapters moved into `casebook.ts` and what is left in that file is the finale text, which `app/story/page.tsx` renders.

---

## Built with

Next.js 16 (App Router), React 19, Tailwind 4, wagmi, viem, RainbowKit, Foundry, Hardhat, `@inco/lightning` and `@inco/lightning-js` v1.0.0, OpenZeppelin, Megapot's deployed V2 contracts.

**No art or audio assets at all.** Every character is drawn as parameterised SVG, every sound is synthesised at runtime with the Web Audio API, the narrator is the browser's own speech synthesis, and every crime scene is generated from the case index. The image files in the repository are the Inco, Megapot, Base and USDC brand marks in `frontend/public/brand`, the site icon at `frontend/app/icon.svg`, and `next.svg` and `vercel.svg` left over from the Next.js scaffold.

The fiction is adapted from the Red John arc of *The Mentalist*, which is CBS-owned. No art, audio or text is taken from it: the cast is drawn from scratch and every line in the game is written for it.
