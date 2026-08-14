/**
 * Deployed addresses and the ABI fragments the frontend actually uses.
 *
 * Hand-written rather than dumped wholesale: a reader should be able to see the entire
 * on-chain surface of this game on one screen. It is short because there is only one
 * contract left in the play path, and the game does not speak to it until the player puts
 * money on a name.
 */

import { activeChain, NETWORK } from "@/lib/network";

/**
 * `Casebook`, the whole game on chain.
 *
 * Holds Red John's person id per case as a ciphertext, takes encrypted bets against it,
 * and pays whoever named him in Megapot tickets bought with the losers' stakes.
 */
/**
 * The live deployment on Base Sepolia. Hardcoded rather than read from the environment: it is
 * public information, it is the same for everybody, and a missing variable used to mean a
 * silently empty address and a site where no case could be opened. The env var still wins if
 * it is set, which is what a local fork or a redeploy needs.
 */
/**
 * The block the live contract was deployed in. Log scans start here: `fromBlock: 0` asks for
 * a forty-five-million block range, which most public RPCs refuse outright.
 */
export const DEPLOY_BLOCK = 45487371n;

export const MENTALIST_ADDRESS = (process.env.NEXT_PUBLIC_MENTALIST_ADDRESS ||
  "0xb39546b5ffedd9778a4de42e3d211fa041ff7cf5") as `0x${string}`;

/**
 * Every contract this game has played on, oldest first, with the block each went live in.
 *
 * Tickets belong to the wallet, not to the deployment that bought them: Megapot mints them
 * to the player and they stay there whatever happens to us afterwards. But the only
 * per-holder record anywhere is the purchase receipt, and each deployment keeps its own, so
 * a counter that reads one contract tells a player who has been playing all week that they
 * hold nothing the moment we redeploy. It reads all of them instead.
 *
 * Append, never edit: dropping a line here does not move any tickets, it only hides them.
 */
export const PAST_DEPLOYMENTS: { address: `0x${string}`; block: bigint }[] = [
  { address: "0x42e3b311fe18e99c78887070f159c10cdfc718f1", block: 45485235n },
  { address: "0xb434119eb6a185d19f591e0fe41552814ab850af", block: 45486182n },
  { address: "0xa2f3a8c88bf1486f9f7db72654d93b984d1bb858", block: 45487000n },
];

/** Everywhere a ticket could have been bought for this player, current deployment included. */
export const TICKET_SOURCES: { address: `0x${string}`; block: bigint }[] = [
  ...PAST_DEPLOYMENTS.filter((d) => d.address.toLowerCase() !== MENTALIST_ADDRESS.toLowerCase()),
  { address: MENTALIST_ADDRESS, block: DEPLOY_BLOCK },
];

/** Follows NEXT_PUBLIC_NETWORK, or every receipt link on mainnet would point at a testnet. */
export const EXPLORER = activeChain.blockExplorers!.default.url;

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;

/**
 * Megapot V2 on Base Sepolia, verified live by RPC on 2026-08-11. Note that V1
 * (`BaseJackpot`, `purchaseTickets`) is archived at v1.docs.megapot.io and is a different,
 * incompatible protocol; these are the current contracts.
 *
 * USDC follows the active network too. `NEXT_PUBLIC_NETWORK=mainnet` already switches the
 * chain the wallet connects to and the Inco instance, so a hardcoded testnet token would be
 * a codeless address there: the balance read would fail silently and the approve would
 * succeed as a no-op, leaving the stake to revert on the transfer.
 */
/**
 * Where a ticket scan starts.
 *
 * The jackpot is older than this game and scanning it from block zero is a range no public
 * RPC will serve, so this is the block the first Mentalist deployment went live in: no
 * ticket this game ever bought predates it.
 */
export const MEGAPOT_SCAN_FROM = 45485235n;

export const MEGAPOT = {
  jackpot: "0x465dA3c859f193A3807386387bEE941B2A4c3279",
  ticketBuyer: "0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746",
  usdc:
    NETWORK === "mainnet"
      ? ("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`)
      : ("0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`),
} as const;

export const MENTALIST_ABI = [
  {
    // Authoring only. The answer is encrypted on the author's machine and this contract
    // never sees it in the clear, which is why it is payable: ingesting costs an Inco fee.
    type: "function",
    name: "openCase",
    stateMutability: "payable",
    inputs: [
      { name: "caseId", type: "uint16" },
      { name: "suspects", type: "uint8" },
      { name: "encryptedAnswer", type: "bytes" },
      { name: "openFor", type: "uint64" },
    ],
    outputs: [],
  },
  {
    // The only transaction in the play loop. `encryptedBet` is the person id, sealed in the
    // browser, so the chain never learns who anyone backed.
    type: "function",
    name: "stake",
    stateMutability: "payable",
    inputs: [
      { name: "caseId", type: "uint16" },
      { name: "encryptedBet", type: "bytes" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    // Hands the player the key to their own verdict bit, and only after the case has closed.
    // The covalidator decrypts on the strength of the on-chain ACL and nothing else, so this
    // grant is the thing that has to wait for the close: an early one is an answer key.
    type: "function",
    name: "unseal",
    stateMutability: "nonpayable",
    inputs: [{ name: "caseId", type: "uint16" }],
    outputs: [],
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "caseId", type: "uint16" },
      {
        name: "attestation",
        type: "tuple",
        components: [
          { name: "handle", type: "bytes32" },
          { name: "value", type: "bytes32" },
        ],
      },
      { name: "signatures", type: "bytes[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [{ name: "caseId", type: "uint16" }],
    outputs: [],
  },
  {
    type: "function",
    name: "payout",
    stateMutability: "nonpayable",
    inputs: [
      { name: "caseId", type: "uint16" },
      // Tickets or cash. Tickets pay a premium, funded by the referral Megapot pays this
      // contract on that same purchase.
      { name: "wantTickets", type: "bool" },
    ],
    outputs: [{ name: "ticketIds", type: "uint256[]" }],
  },
  {
    // What the keeper calls so a winner never has to come back and file to be counted.
    // Permissionless: it verifies a covalidator signature over a handle this contract
    // stored, so a caller can carry a verdict but cannot invent one.
    type: "function",
    name: "resolveFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "caseId", type: "uint16" },
      { name: "player", type: "address" },
      {
        name: "attestation",
        type: "tuple",
        components: [
          { name: "handle", type: "bytes32" },
          { name: "value", type: "bytes32" },
        ],
      },
      { name: "signatures", type: "bytes[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "resolveMany",
    stateMutability: "nonpayable",
    inputs: [
      { name: "caseId", type: "uint16" },
      { name: "players", type: "address[]" },
      {
        name: "attestations",
        type: "tuple[]",
        components: [
          { name: "handle", type: "bytes32" },
          { name: "value", type: "bytes32" },
        ],
      },
      { name: "signatures", type: "bytes[][]" },
    ],
    outputs: [],
  },
  {
    // Resolver-only, and only after the close. An ACL grant before that is the whole game.
    type: "function",
    name: "unsealFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "caseId", type: "uint16" },
      { name: "players", type: "address[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setResolver",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "ticketBonusBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    // Carries the ticket ids a payout bought, which is the only per-player record of Megapot
    // holdings anywhere: the jackpot contract has no balance view for a ticket holder.
    type: "event",
    name: "PaidOut",
    inputs: [
      { name: "caseId", type: "uint16", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "share", type: "uint256", indexed: false },
      { name: "ticketIds", type: "uint256[]", indexed: false },
    ],
  },
  {
    // Opens the answer once a case is settled. Before that the ciphertext has no key at all,
    // not even for the owner.
    type: "function",
    name: "revealAnswer",
    stateMutability: "nonpayable",
    inputs: [{ name: "caseId", type: "uint16" }],
    outputs: [],
  },
  {
    type: "function",
    name: "answerHandle",
    stateMutability: "view",
    inputs: [{ name: "caseId", type: "uint16" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "caseId", type: "uint16" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cases",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint16" }],
    outputs: [
      { name: "closesAt", type: "uint64" },
      { name: "suspects", type: "uint8" },
      { name: "pot", type: "uint128" },
      { name: "winningStake", type: "uint128" },
      { name: "entrants", type: "uint32" },
      { name: "winners", type: "uint32" },
      { name: "settled", type: "bool" },
      { name: "exists", type: "bool" },
      // How many entrants have a verdict recorded. When it reaches `entrants` the room is
      // complete and the money releases at once, with no window left to wait out.
      { name: "filed", type: "uint32" },
    ],
  },
  {
    type: "function",
    name: "bets",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint16" },
      { name: "", type: "address" },
    ],
    outputs: [
      { name: "stake", type: "uint128" },
      { name: "resolved", type: "bool" },
      { name: "won", type: "bool" },
      { name: "paid", type: "bool" },
    ],
  },
  {
    // The handle a player must file their attestation over. Without it there is no way to
    // ask the covalidator for the one bit that decides the case.
    type: "function",
    name: "verdictHandle",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint16" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "shareOf",
    stateMutability: "view",
    inputs: [
      { name: "caseId", type: "uint16" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    // How long after the close a verdict may still be filed. `settle` opens exactly where
    // this ends, so the two never overlap and nobody can shut the books on a slow filer.
    type: "function",
    name: "FILING_WINDOW",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "quoteFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "timeLeft",
    stateMutability: "view",
    inputs: [{ name: "caseId", type: "uint16" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "hasStaked",
    stateMutability: "view",
    inputs: [
      { name: "caseId", type: "uint16" },
      { name: "player", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** Just enough ERC20 to approve and read a balance. */
export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
