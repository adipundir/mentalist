# MENTALIST

**Nine suspects. One of them is the Tyger. Some of them lie — and the Tyger always does.**

A confidential deduction game built on [Inco Lightning](https://docs.inco.org) and
[Megapot](https://docs.megapot.io) for the Inco × Megapot Summer Game Jam, 2026.

---

## The one line this game exists for

```solidity
ebool truth  = e.or(...);              // is the Tyger inside the set you asked about?
ebool answer = e.xor(truth, liar[w]);  // ...as filtered through witness w's hidden honesty
```

You interrogate witnesses with yes/no questions about who's in the room. The answer you get
back is the truth about a secret you're hunting, **corrupted by a second secret you also
can't see**. The chain sees *what you asked*. Only you see *what you were told*.

That is not privacy for its own sake — it is the entire strategic surface. Reveal the
honesty bit and there is no game left.

**Why no other approach does this.** Existing confidential games hide a *value*: a card, a
board, a role, a bid. This hides a **transformation**. Commit-reveal cannot emulate it —
proving the answer was computed honestly would mean opening the honesty bit, which is
precisely the information the game is about. A trusted server could do it, but then the
server *is* the game.

---

## Play it

| | | |
|---|---|---|
| **Watch a case** | `/case/demo?auto=1` | Zero clicks. |
| **Solve one** | `/case/demo` | **No wallet.** The real game, dealt in your browser. |
| **Play on-chain** | `/case/play` | Base Sepolia. Encrypted state, attested answers, real Megapot tickets. |

The no-wallet demo is not a mock-up. It runs the same rules, the same dealer distribution
and the same `answer = truth XOR liar[witness]` computation as the contract, over a latency
profile sampled from real Base Sepolia + covalidator measurements. What you learn playing it
transfers exactly.

---

## How to play

You have **Focus**. Every question spends some. There are three worth knowing:

**The control question** — ask about *everyone*, costs 2.
The Tyger is always somewhere in the full lineup, so the answer is *purely* whether this
witness lies. A perfect, 100%-reliable honesty test — and literally the interrogator's
trick it's named after: ask a question you already know the answer to.

**The split** — mark about half the board, costs 1.
Worth a full bit of information, but only once you know whether to believe the witness.

**The self-incrimination** — "are *you* the Tyger?", costs 1.

| Witness is… | truth | lies | answer |
|---|---|---|---|
| innocent + honest | false | no | **NO** |
| innocent + liar | false | yes | **YES** |
| the Tyger | true | yes (always) | **NO** |

A **yes is proof of an innocent liar** — it exposes them and clears them at once.

**The elegant part:** once a control question proves a witness lies, they become a *perfect
oracle* — just read them backwards. A control question is never wasted. The real decision is
whether you can afford 2 Focus to be certain, or gamble 1 that you're already right.

---

## What's here

```
contracts/
  contracts/Mentalist.sol      the game — encrypted deal, the xor lie, attested settlement
  contracts/CaseRewards.sol    Megapot layer — surplus Focus buys real lottery tickets
  test-forge/                  25 Foundry tests, no Docker required
frontend/
  lib/case.ts                  domain model, shared by both play modes
  lib/solver.ts                the Notebook — enumerates every layout still consistent
  lib/oracle.ts                the seam: localOracle (demo) and the Oracle interface
  lib/chain-oracle.ts          the same interface, backed by Base + Inco
  components/CaseBoard.tsx     the board
DESIGN.md                      why the game is shaped this way
```

### The architecture decision that mattered

One `Oracle` interface, two implementations. `CaseBoard` cannot tell whether it's talking to
a browser or to Base. That's what makes the no-wallet demo *faithful* rather than a
lookalike, and it means the game is playable by a judge with ninety seconds and no wallet.

---

## Running it

```bash
pnpm install          # see the note below if this fails
pnpm dev              # http://localhost:3000 — the demo needs nothing else
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
> …or set that rewrite globally. The `package.json` overrides already use `git+https://`
> URLs; this covers transitive specs that don't.

### Contracts

```bash
cd contracts
forge test            # 25 tests, in-process Inco mock, no Docker
pnpm compile
```

### Live on Base Sepolia

| | |
|---|---|
| `Mentalist` | [`0x6ED2DF67Bf8FB2D84F8648ef741ef48ce39feF17`](https://sepolia.basescan.org/address/0x6ED2DF67Bf8FB2D84F8648ef741ef48ce39feF17) |
| `CaseRewards` | [`0x4b3250dad7C853fD34030910434846fCbe91e3bC`](https://sepolia.basescan.org/address/0x4b3250dad7C853fD34030910434846fCbe91e3bC) |

Put both into `frontend/.env.local` as `NEXT_PUBLIC_MENTALIST_ADDRESS` and
`NEXT_PUBLIC_REWARDS_ADDRESS` (see `.env.example`). To redeploy:
`pnpm --filter contracts deploy:testnet`.

**Proving it works end to end**, against the live covalidator rather than a mock:

```bash
pnpm --filter contracts play:onchain
```

That opens a real case, asks the control question, reads the answer back through
`attestedDecrypt`, plays binary splits to a single suspect, accuses, and asserts the four
invariants the design rests on. A passing run looks like this:

```
case #2 opened in 2618ms  (fee 140625000000 wei, gas 1314742)
control question: witness 0 -> NO   -> witness 0 is A LIAR (read them inverted)
binary splits:    9 -> 4 -> 2 -> 1
seat 1  THE TYGER  lied
CASE CLOSED — the deduction was correct.
  PASS  exactly one Tyger
  PASS  the Tyger lies
  PASS  liar count is LIARS or LIARS+1
  PASS  the deduction found him
```

To fund Megapot rewards, send Base Sepolia USDC
(`0x036CbD53842c5426634e7929541eC2318f3dCF7e`, from
[faucet.circle.com](https://faucet.circle.com)) to the `CaseRewards` address. At 0.01 USDC
per ticket on testnet, 20 USDC is 2,000 tickets.

---

## Testing notes

`forge test` covers the rules end to end: the encrypted lie behaves as `truth XOR honesty`
for every witness and every subset, the control question is exactly an honesty test, a
9-suspect case is always solvable in 6 Focus, testimony is decryptable by the detective and
by nobody else, the layout is decryptable by nobody at all until an accusation, and
settlement rejects a validly-signed attestation for the wrong handle.

Two things worth flagging honestly:

**elist operations are not implemented in Inco's in-process Foundry mock** (v1.0.0), so a
contract that shuffles cannot execute under `forge test` at all. `_deal` is therefore
`virtual`, and `MentalistHarness` substitutes a `randBounded`-based dealer that exercises
every other rule. The real shuffle dealer needs the Docker covalidator or a testnet deploy.

**The documented Foundry cheatcode names have drifted.** `getBoolValue` / `getUint256Value`
do not exist in 1.0.0; the real surface is `get(handle)` and
`getDecryptionAttestation(requester, HandleWithProof)`.

---

## Measured on-chain latency

From a real playthrough on Base Sepolia:

| step | time |
|---|---|
| `openCase` | ~2.6 s |
| `interrogate` (mining) | 1.6 – 2.4 s |
| `attestedDecrypt` | **5.5 – 11.3 s** |
| full six-move case | ~103 s |

The decrypt dominates by a wide margin, and an earlier draft of the frontend had guessed it
at ~1.6 s — wrong by roughly 5×, with the animation budget built on top of that guess. The
demo deliberately runs faster than the chain and says so; what carries between the two modes
is the deduction and the choreography, not the wall clock.

Two races only a live run surfaces, both now handled:

- **Stale reads.** `sepolia.base.org` is load-balanced, so a confirmed receipt does not mean
  the next `eth_call` reaches a node with that block. viem simulates before every write, so
  the first `interrogate` could revert `WrongStatus()` against state that was already
  committed. The oracle now waits for the case to read back as open.
- **"acl disallowed" is not terminal.** For a second or two after `interrogate` lands, the
  covalidator can see the answer handle before it has indexed the `e.allow` that came with
  it — `inco.isAllowed(handle, detective)` returns `true` on-chain while the enclave still
  refuses. The SDK treats `PermissionDenied` as fatal, so an outer retry wraps it.

## Two bugs the tests caught

**The design doc was wrong about the Focus economy.** It claimed the standard line costs
*exactly* 6 Focus. Playing the strategy to completion across twelve fresh deals showed the
worst case is 6 and the typical case is 5. Corrected — and the surplus turned out to be the
better design, because it's what converts to Megapot tickets.

**Streaks were unenforceable.** Settlement is player-initiated, so a detective who accused
wrongly could simply never submit the attestation, leave the case hanging, and open a fresh
one with their streak intact. Only wins would ever get settled and every leaderboard entry
would have been a lie. Opening a case now forces the previous one to resolve, as a loss.

---

## Honest framing

Inco is **TEE-based confidential compute — not FHE, and not zk.** "Secret" means the value
is decrypted inside an Intel TDX enclave. "Provably fair" means a covalidator attestation,
not a zero-knowledge proof.

The claim this game makes is real and worth making: the deployer genuinely cannot know who
the Tyger is, because placement happens inside the enclave and no plaintext ever touches the
chain. But it rests on a hardware trust assumption, and that is worth saying plainly rather
than overselling.

The antagonist is **the Tyger**, from Blake's 1794 poem — public domain. The game's
inspiration is CBS-owned, so every suspect here is generated and no character names are
borrowed. *"What immortal hand or eye / Could frame thy fearful symmetry?"* turns out to
describe matching a hidden profile rather well.
