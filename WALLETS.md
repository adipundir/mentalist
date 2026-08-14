# Wallets to fund (Base Sepolia, chain 84532)

Testnet only. Both keys were generated for this project and are used for nothing else,
so do not send mainnet funds to either.

| Role | Address | Needs | Why |
|---|---|---|---|
| Deployer / owner | `0xeeeA77e9dCb9DF9EA10d1eDe21ba1046087aAf95` | **ETH**, and USDC only if it plays | Deploys, `openCase`, `reschedule`, and the Inco ingest fee on every case opened |
| Keeper / resolver | `0x43FDBd9029244F002680996D053236c0EB888CC3` | **ETH only** | `unsealFor`, `resolveMany`, `settle`. No money ever passes through it |

Suggested: **0.05 ETH each** covers a judging week comfortably. The keeper never needs USDC.

Faucets: ETH https://www.alchemy.com/faucets/base-sepolia · USDC https://faucet.circle.com

The keeper is deliberately not the owner. Its key sits on a server and runs unattended, so a
leak must not be able to move the rake, the resolver, or the surplus. The worst a stolen
keeper key can do is spend its own gas: `resolveFor` verifies a covalidator signature over a
handle the contract stored, so it can carry a verdict but never invent one.

## Balances at 2026-08-14 19:46 UTC

- Deployer: 174613815543515 wei ETH, 3038000 USDC (6dp)
- Keeper:   215371357536986 wei ETH, 0 USDC (6dp)

Contract: `0xc499a06023c81917dcf6188928c34a1e8b54ab7e`
