# MENTALIST

**Seven rooms. Everyone in them knows who did it. Not all of them will tell you.**

**Play it: https://red-john-cases.vercel.app**

A confidential deduction game on Base Sepolia, adapted from the Red John arc of *The
Mentalist*, wrapped in a pari-mutuel prediction market. Built on
[Inco Lightning](https://docs.inco.org) and [Megapot](https://docs.megapot.io) for the
Inco × Megapot Summer Game Jam, 2026.

You stake USDC on a room full of suspects, work out which of them did it before your clock
runs out, and if you are right you take a share of everything the people who were wrong put
in, paid as real Megapot lottery tickets.

---

## The one line this game exists for

```solidity
ebool truth  = e.or(...);              // is the killer inside the set he speaks about?
ebool answer = e.xor(truth, liar[w]);  // ...as filtered through w's hidden honesty
```

What you are told is the truth about a secret you are hunting, corrupted by a second secret
you also cannot see. The chain sees who spoke and who he spoke about. Only you see what he
said.

That is not privacy for its own sake, it is the entire strategic surface. Reveal the honesty
bit and there is no game left.

**Why no other approach does this.** Existing confidential games hide a *value*: a card, a
board, a role, a bid. This hides a **transformation**. Commit-reveal cannot emulate it,
because proving the answer was computed honestly would mean opening the honesty bit, which is
precisely the information the game is about. A trusted server could do it, but then the
server *is* the game.

---

## How a case is played

1. **Open the case.** Approve your stake, open your own case on `Mentalist`, hand the case id
   to the market. Three transactions, and then a 20-minute clock.
2. **Walk up to a man.** You click one suspect. That is the entire input.
3. **He says one thing.** Every suspect has exactly one statement in him, and it is always
   about the same fixed set of other suspects, decided before the case was dealt. The enclave
   computes whether the killer is inside that set, then XORs the result with that speaker's
   hidden honesty bit. **The words are scripted. The direction is not.** If he lies, the
   sentence comes out inverted, and nothing about the delivery tells you which happened.
4. **Everyone speaks once**, in whatever order you like.
5. **Name him.** The board is revealed, the contract rules on whether you were right.

There is no Focus budget to spend, no question builder, no control question, no turncoat. The
only decision that matters is the last one, and everything before it is reading a room.

> The contract still takes a question budget and a turncoat parameter, because it is a more
> general machine than the game currently asks it to be. Every round is configured with one
> question per suspect and the turncoat switched off, so neither appears in play.

### Who each man speaks about is searched, not authored

The claim masks in `frontend/lib/story.ts` were not written by taste. For each case, the
assignment chosen is the one that leaves the fewest suspects standing once every man has
spoken.

It does not always leave one. Depending on how the case was dealt you can be left with two
men who fit everything you were told, and on the larger boards sometimes three. That residual
ambiguity is deliberate and it is the reason a stake means anything: some rooms hand you an
answer, and some hand you a decision.

### The lineup

| Case | Title | Suspects | Lying |
|---|---|---|---|
| I | Cinnabar Sunday | 4 | 1 |
| II | The Vermilion Hour | 6 | 2 |
| III | Oxblood Handshake | 8 | 3 |
| IV | Seven Shades of Crimson | 7 | 3 |
| V | Carmine on Her Cheek | 6 | 4 |
| VI | Claret and Brimstone | 5 | 4 |
| VII | Sanguine | 3 | 2 |

The liar count is the *base* count. The killer is welded onto it with one encrypted OR
(`liar[i] = e.or(liar[i], guilt[i])`), so the realised number of liars is that figure or one
more, and you never learn which. That denies you an exact parity check on the liar
population, which would otherwise be worth a free deduction.

One case lands per day from the season epoch, and each stays playable until its round closes
on chain, so a player who arrives late can still work the earlier rooms.

---

## The market

`contracts/contracts/CaseMarket.sol`. One round per case, each with its own pot.

- **Stake USDC to enter**, between 0.10 and 5.00. **One entry per wallet per case.** You get
  one read of each room.
- **A 20-minute play window** starts when your stake lands. Name him inside it and you are a
  winner. Miss, or run out of clock, and your stake stays in the pot.
- **Winners split the whole pot**, pro rata to stake: `pot * yourStake / totalWinningStake`.
  Conviction pays twice, once for being right and once for how much you were willing to put
  behind it.
- **Payout is in real Megapot tickets**, bought for the winner's wallet with the losers'
  stakes and gifted straight to them, batched in tens because Megapot's quick-pick buyer
  rejects counts outside 1 to 10. Anything left under the price of a whole ticket is returned
  as USDC rather than kept by the house.
- **If nobody solves a case**, everyone who entered gets their stake back. A pot with no
  winners has nobody to divide it among.

It is pari-mutuel rather than fixed odds for a reason: fixed odds need a bookmaker with a
balance sheet, and any multiplier this contract set would be a number someone invented. A
pool sets its own price and can never be insolvent, because it only ever pays out what it
already holds.

### The market never touches an encrypted handle

The order of operations is the point, and it is why staking is three transactions instead of
one. **The player opens their own case on `Mentalist`**, so every answer is granted to them
with `e.allow` and to nobody else, the market included. Only then is the case id handed to
`enter`, which verifies that the case is theirs, untouched (`questionsAsked == 0`), and
matches the lineup this round calls for. Without that check a player could walk in with a
four-man case and take the pot off people who played the eight-man one.

Settlement runs the same way round. `recordResult` reads `solved` off the game contract, and
`solved` only becomes true after `Mentalist.settle` has verified a covalidator attestation
over the accused seat's encrypted guilt bit, with a handle-match check. **The pool settles
against Inco's attested verdict**, not against anything the player or the browser asserts. A
market that settled on a number the client reported would just be a scoreboard.

---

## What this does not do

**It does not guarantee a single answer.** The claim search minimises how many suspects
survive the testimony, not the worst case. Cases with small lineups usually collapse to one
man; the middle chapters frequently leave two, and the eight-man and seven-man boards can
leave three. When that happens you are betting, not solving, and the pari-mutuel split is
built for exactly that.

**It is testnet only.** Base Sepolia, testnet USDC, and Megapot's testnet jackpot. The stakes
are real transactions with no real money behind them. There is no mainnet deployment.

**The seven cases are a fixed run, not generated content.** The rosters, the scripts, the
crime scenes and the claim masks are seven hand-built rooms released one a day. What is dealt
fresh inside each one is the layout: who is guilty and who lies, placed by the enclave every
time a case is opened. When the seventh case closes, the season is over.

---

## Playing it

You need two things in a Base Sepolia wallet:

- **Testnet USDC** for the stake, from [faucet.circle.com](https://faucet.circle.com)
  (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`).
- **A little test ETH** for gas and for the Inco list fee that opening a case charges. The
  fee is quoted by `quoteOpenFee` and is a fraction of a cent.

Everything else in the game is fee-free: `interrogate` runs `getEbool`, `e.or`, `e.xor` and
`e.allow`, none of which charge an Inco fee, so the moment-to-moment loop is an ordinary
cheap Base transaction.

---

## What's here

```
contracts/
  contracts/Mentalist.sol      the game: encrypted deal, the xor lie, attested settlement
  contracts/CaseMarket.sol     the pari-mutuel pool, and the Megapot payout
  contracts/CaseRewards.sol    the Megapot interfaces (IJackpot, IJackpotRandomTicketBuyer)
                               plus the standalone per-case ticket path the market supersedes
  test-forge/                  52 Foundry tests, no Docker required
  scripts/deploy-market.ts     deploys both contracts and opens all seven rounds
  scripts/play-onchain.ts      a full case against the live covalidator, not a mock
frontend/
  lib/story.ts                 the seven cases: rosters, claim masks, prose
  lib/canon.ts                 the cast, drawn to the character system
  lib/script.ts                what a suspect says, and why the words are not the answer
  lib/chain-oracle.ts          Base + Inco: both reveal loops, and the races they hit
  lib/solver.ts                the Notebook, enumerates every layout still consistent
  lib/schedule.ts              one case a day, derived from a fixed epoch
  components/Scene.tsx         the room, which is the whole interface
  components/Stake.tsx         approve, open your own case, hand it to the market
  components/Settlement.tsx    file the verdict, record it, collect in tickets
DESIGN.md                      why the game is shaped this way
```

### Which Inco loop, where

Both reveal models are used, each where it belongs.

- **Loop B, private decrypt, for testimony.** `interrogate` grants the answer to the
  detective with `e.allow`, and the client reads it with `attestedDecrypt`. Nobody else can
  read it, not even by watching the chain.
- **Loop A, public reveal, plus Model A settlement, for the verdict.** `accuse` calls
  `e.reveal` over the whole board, so the post-mortem paints with no signature at all, and
  `settle` hands the covalidator's attestation back to the contract with a handle-match
  check. The signature alone would only prove the enclave decrypted *some* handle; without
  the match a player could settle on a different, conveniently true bit.

### Art and audio

No art or audio assets. Every character is drawn as inline SVG from a spec, every sound is
synthesised at runtime with the Web Audio API, the narrator is the browser's own speech
synthesis, and the room is a generated crime scene laid out from the case index, so Chapter I
and Chapter VI are recognisably different rooms without seven sets of coordinates to
maintain. The only image files in the repository are the Inco, Megapot and Base brand marks
in `frontend/public/brand`.

---

## Running it

```bash
pnpm install          # see the note below if this fails
pnpm dev              # http://localhost:3000
```

> **`pnpm install` and SSH.** The Inco scaffold pins three git dependencies. If you don't
> have GitHub SSH keys configured, pnpm fails with `Host key verification failed`. Either
> use the HTTPS rewrite for one invocation:
>
> ```bash
> GIT_CONFIG_COUNT=2 \
>   GIT_CONFIG_KEY_0='url.https://github.com/.insteadOf' GIT_CONFIG_VALUE_0='ssh://git@github.com/' \
>   GIT_CONFIG_KEY_1='url.https://github.com/.insteadOf' GIT_CONFIG_VALUE_1='git@github.com:' \
>   pnpm install
> ```
>
> ...or set that rewrite globally. The `package.json` overrides already use `git+https://`
> URLs; this covers transitive specs that don't.

`frontend/.env.local` needs the deployed addresses. There is no offline mode: without them
the room paints but cannot be played, because a simulated case would be a different game.

```
NEXT_PUBLIC_MENTALIST_ADDRESS=0xCF72B6D36619861521BF1b04f3A64e3647aE9356
NEXT_PUBLIC_MARKET_ADDRESS=0x8b1508f518e4a04961c5f57ad6734304574f05f7
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=       # optional, enables mobile wallets
```

### Contracts

```bash
cd contracts
forge test                              # 52 Foundry tests, in-process Inco mock, no Docker
pnpm compile
pnpm deploy:market                      # both contracts, then opens all seven rounds
pnpm play:onchain                       # a real case against the live covalidator
```

`deploy:market` is deliberately one script for both contracts: the market checks that the
case you hand it matches the lineup its round calls for, so the specs it is configured with
and the rosters the frontend opens cases with have to be the same seven rows of data.

`play:onchain` opens a real case, asks a question, reads the answer back through
`attestedDecrypt`, narrows to a single suspect, accuses, settles, and asserts the invariants
the design rests on. If it passes, the whole confidential loop works against a live
covalidator rather than a mock.

---

## Live on Base Sepolia

| | |
|---|---|
| `Mentalist` | [`0xCF72B6D36619861521BF1b04f3A64e3647aE9356`](https://sepolia.basescan.org/address/0xCF72B6D36619861521BF1b04f3A64e3647aE9356) |
| `CaseMarket` | [`0x8b1508f518e4a04961c5f57ad6734304574f05f7`](https://sepolia.basescan.org/address/0x8b1508f518e4a04961c5f57ad6734304574f05f7) |
| Megapot `Jackpot` | [`0x465dA3c859f193A3807386387bEE941B2A4c3279`](https://sepolia.basescan.org/address/0x465dA3c859f193A3807386387bEE941B2A4c3279) |
| Megapot `JackpotRandomTicketBuyer` | [`0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746`](https://sepolia.basescan.org/address/0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746) |
| USDC | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |

Two Megapot facts worth stating, both confirmed against the chain by RPC rather than read off
a docs page. The live protocol is **V2** (`Jackpot` + `JackpotRandomTicketBuyer`); the V1
`BaseJackpot` / `purchaseTickets` API that fills search results is archived and incompatible.
And `_referralSplitBps` is **1e18-scaled** despite the name, and must sum to exactly `1e18`;
passing basis points silently mis-splits the fee. `CaseMarket.FULL_REFERRAL_SPLIT` is `1e18`
with a comment saying so. Nothing else is hardcoded that shouldn't be: the market reads the
jackpot and the ticket token off the buyer contract at construction, and the ticket price
live on every claim.

---

## Proved on chain, with money

`contracts/scripts/prove-market.ts` runs the entire loop against the live contracts and a
live covalidator: it stakes real USDC, opens a case, hears every suspect's statement through
attested decryption, solves it from the statements alone with no privileged reads, names a
man, files the attestation, and records the result against the pot.

```
resuming case #3 (already staked 1 USDC)
pot is 1 USDC across 1 entrant(s)
contract ruled: CORRECT
recorded: won=true  share=1 USDC
round: pot 1, winning stake 1, 1 entrants, 1 winners

PASS  market took the stake
PASS  entry is bound to the case that was dealt
PASS  the contract's ruling and the market agree
PASS  a solved case has a share, a missed one does not
PASS  deduction narrowed the room
```

An earlier run of the same script on case II drew two surviving candidates, named the wrong
one, and correctly took nothing. That is the game working, not failing.

> The script reads every value until two consecutive reads agree. Base Sepolia's public
> endpoints are load balanced, and a read issued straight after a receipt can land on a node
> that has not seen the block. An earlier version reported a solved case as a miss for
> exactly that reason, which is a lie about the chain rather than a finding about the
> contract.

## Testing notes

`forge test` runs 52 Foundry tests: 23 on the game, 26 on the market.

The game suite asserts that `answer` is exactly `truth XOR honesty` for every witness and
every subset, that there is exactly one killer and he always lies, that testimony is
decryptable by the detective and by nobody else, that the layout is decryptable by nobody at
all until an accusation, that settlement rejects a validly signed attestation for the wrong
handle, and that abandoning a case resolves it as a loss.

The market suite asserts one entry per wallet, that a case belonging to someone else or
already in progress or with the wrong lineup is refused, that solving after the deadline
loses, that the pot splits pro rata to stake, that a claim buys real tickets and batches them
correctly, that the sub-ticket remainder goes back to the player, that nobody solving means
everybody is refunded, that `reserved` drains to zero once winners are paid, and that the
owner cannot withdraw another round's stakes. It runs against a mock jackpot that mirrors the
real buyer's constraints; the live path is exercised on Base Sepolia.

Two things worth flagging honestly:

**elist operations are not implemented in Inco's in-process Foundry mock** (v1.0.0), so a
contract that shuffles cannot execute under `forge test` at all. `_deal` is therefore
`virtual`, and `MentalistHarness` substitutes a `randBounded`-based dealer that exercises
every other rule. The one property the harness does not reproduce is *exactly K liars*, since
its honesty draw is binomial rather than a shuffle of a fixed multiset. The real dealer needs
the Docker covalidator or a testnet deploy.

**The documented Foundry cheatcode names have drifted.** `getBoolValue` / `getUint256Value`
do not exist in 1.0.0; the real surface is `get(handle)` and
`getDecryptionAttestation(requester, HandleWithProof)`.

---

## Measured on-chain latency

From real playthroughs on Base Sepolia, measured with `pnpm --filter contracts play:onchain`
and `scripts/measure-latency.ts`, warm SDK:

| step | time |
|---|---|
| SDK cold init | ~1.7 s (pre-warmed during the boot screen) |
| `openCase` | ~2.1 s |
| `interrogate` (mining) | 1.6 to 2.4 s |
| `attestedDecrypt` | 5.5 to 11.3 s, ~8 s typical, and it does *not* improve when warm |
| a six-move case, end to end | ~103 s |

The decrypt dominates by a wide margin and is irreducible from the client side, so the game
is built around it rather than pretending otherwise. The wait is staged as named beats, the
suspect performs through it, and a drone beats a minor second until the answer resolves it to
unison. Ten seconds of a suspect refusing to answer is the tensest thing in an interrogation.
Ten seconds of a progress bar is a bug report.

An earlier draft of the frontend had guessed the decrypt at ~1.6 s, wrong by roughly 5x, with
the animation budget built on top of that guess.

Two races only a live run surfaces, both now handled in `lib/chain-oracle.ts`:

- **Stale reads.** `sepolia.base.org` is load-balanced, so a confirmed receipt does not mean
  the next `eth_call` reaches a node with that block. viem simulates before every write, so
  the first `interrogate` could revert `WrongStatus()` against state that was already
  committed. The oracle waits for the case to read back as open.
- **"acl disallowed" is not terminal.** For a second or two after `interrogate` lands, the
  covalidator can see the answer handle before it has indexed the `e.allow` that came with
  it, so `inco.isAllowed(handle, detective)` returns `true` on-chain while the enclave still
  refuses. The SDK treats `PermissionDenied` as fatal, so an outer retry wraps it. Without
  that, the first question of every session fails.

---

## Honest framing

Inco is **TEE-based confidential compute, not FHE, and not zk.** "Secret" means the value is
decrypted inside an Intel TDX enclave. "Provably fair" means a covalidator attestation, not a
zero-knowledge proof.

The claim this game makes is real and worth making: the deployer genuinely cannot know who
the killer is, because placement happens inside the enclave and no plaintext ever touches the
chain. But it rests on a hardware trust assumption, and that is worth saying plainly rather
than overselling.

The fiction is adapted from the Red John arc of *The Mentalist*, which is CBS-owned. No art,
audio or text assets are taken from it: the cast is drawn from scratch as SVG and every line
in the game is written for it. The contracts call the antagonist "the Tyger", from Blake's
1794 poem, which is public domain, and which is also the arc's own passcode.

---

## Pre-existing work disclosure

Required by the jam's Terms & Conditions §4.2 ("You must disclose in writing any pre-existing,
project-specific work included in your submission, along with details in your repository
history and description").

**There is no pre-existing project-specific work in this submission.** Everything in
`contracts/contracts/`, `contracts/test-forge/`, `contracts/scripts/`, `frontend/lib/`,
`frontend/hooks/`, `frontend/components/` and `frontend/app/` was written during the jam
window and is visible as incremental commits in this repository's history.

What is *not* ours, and is used as a building block under §4.1 ("You may use open-source
libraries, frameworks, public SDKs, and third-party APIs, including Inco and Megapot
tooling"):

| | |
|---|---|
| Project skeleton | `create-inco-app` (Inco's official scaffold): Hardhat + Next.js + RainbowKit wiring. Its two example contracts (`ConfidentialERC20`, `ConfidentialLottery`) were **deleted**; see commit `0ce43c5`. |
| Confidential compute | `@inco/lightning` and `@inco/lightning-js` v1.0.0 |
| Lottery protocol | Megapot's deployed `Jackpot` and `JackpotRandomTicketBuyer` contracts |
| Everything else | Next.js, React, wagmi, viem, Tailwind, framer-motion, Foundry, OpenZeppelin |

The very first commit (`0d502db`) is the untouched scaffold, so the diff from that commit to
`HEAD` is exactly the work done during the jam.