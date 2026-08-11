import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the game and, optionally, the Megapot reward layer.
 *
 * The game contract is pre-funded on deploy so it can **sponsor** Inco fees out of its own
 * balance: dealing a case costs two encrypted-list creations and two shuffles, and making
 * the player think about that would be a bad first thirty seconds. Everything after the
 * deal — every interrogation — charges no Inco fee at all.
 *
 * Megapot's quick-pick buyer, by network (verified live by RPC on 2026-08-11):
 *   Base Sepolia  0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746  (0.01 USDC/ticket, 30-min draws)
 *   Base mainnet  0xb9560b43b91dE2c1DaF5dfbb76b2CFcDaFc13aBd  (1.00 USDC/ticket, 24h draws)
 *
 * Set MEGAPOT_TICKET_BUYER to skip or override. The reward layer is deliberately optional:
 * `Mentalist` stands alone for the Inco track and knows nothing about lotteries.
 */
const MEGAPOT_BUYER: Record<number, string> = {
  84532: "0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746",
  8453: "0xb9560b43b91dE2c1DaF5dfbb76b2CFcDaFc13aBd",
};

export default buildModule("Mentalist", (m) => {
  // Sized against the actual fee schedule rather than guessed. An elist op costs
  // BIT_FEE (1e-6 ETH / 256) × elements × bits, and a Bool is 1 bit, so dealing a
  // 9-suspect case — two list creations plus two shuffles — is 140,625,000,000 wei,
  // about 0.00000014 ETH. 0.0003 ETH therefore sponsors roughly 2,000 cases.
  //
  // It is belt-and-braces anyway: `openCase` requires the player's msg.value to cover
  // the fee, and that lands in the contract balance before the library draws from it,
  // so the game is self-funding. This float just means it can never stall on a rounding
  // edge, and it keeps the door open to sponsoring cases outright later.
  const sponsorship = m.getParameter("sponsorship", 300_000_000_000_000n); // 0.0003 ETH

  const game = m.contract("Mentalist", [], { value: sponsorship });

  const buyer = m.getParameter("ticketBuyer", MEGAPOT_BUYER[84532]);
  const owner = m.getAccount(0);

  const rewards = m.contract("CaseRewards", [game, buyer, owner]);

  return { game, rewards };
});
