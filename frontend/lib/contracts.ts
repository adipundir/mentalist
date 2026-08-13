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
export const CASEBOOK_ADDRESS = (process.env.NEXT_PUBLIC_CASEBOOK_ADDRESS ??
  "") as `0x${string}`;

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
export const MEGAPOT = {
  jackpot: "0x465dA3c859f193A3807386387bEE941B2A4c3279",
  ticketBuyer: "0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746",
  usdc:
    NETWORK === "mainnet"
      ? ("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`)
      : ("0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`),
} as const;

export const CASEBOOK_ABI = [
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
    inputs: [{ name: "caseId", type: "uint16" }],
    outputs: [{ name: "ticketIds", type: "uint256[]" }],
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
