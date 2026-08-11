/**
 * Deployed addresses and the ABI fragments the frontend actually uses.
 *
 * Hand-written rather than dumped wholesale: a reader should be able to see the entire
 * on-chain surface of this game on one screen.
 */

import { baseSepolia } from "wagmi/chains";

export const MENTALIST_ADDRESS = (process.env.NEXT_PUBLIC_MENTALIST_ADDRESS ??
  "") as `0x${string}`;

export const REWARDS_ADDRESS = (process.env.NEXT_PUBLIC_REWARDS_ADDRESS ??
  "") as `0x${string}`;

export const isDeployed = () => /^0x[a-fA-F0-9]{40}$/.test(MENTALIST_ADDRESS);

export const EXPLORER = baseSepolia.blockExplorers.default.url;

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (addr: string) => `${EXPLORER}/address/${addr}`;

/**
 * Megapot V2 on Base Sepolia — verified live by RPC on 2026-08-11. Note that V1
 * (`BaseJackpot`, `purchaseTickets`) is archived at v1.docs.megapot.io and is a different,
 * incompatible protocol; these are the current contracts.
 */
export const MEGAPOT = {
  jackpot: "0x465dA3c859f193A3807386387bEE941B2A4c3279",
  ticketBuyer: "0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
} as const;

export const MENTALIST_ABI = [
  {
    type: "function",
    name: "openCase",
    stateMutability: "payable",
    inputs: [
      { name: "suspects", type: "uint8" },
      { name: "liars", type: "uint8" },
      { name: "focus", type: "uint8" },
      { name: "turnAt", type: "uint8" },
    ],
    outputs: [{ name: "caseId", type: "uint256" }],
  },
  {
    type: "function",
    name: "interrogate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "caseId", type: "uint256" },
      { name: "witness", type: "uint8" },
      { name: "mask", type: "uint16" },
    ],
    outputs: [{ name: "answerHandle", type: "bytes32" }],
  },
  {
    type: "function",
    name: "accuse",
    stateMutability: "nonpayable",
    inputs: [
      { name: "caseId", type: "uint256" },
      { name: "seat", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "caseId", type: "uint256" },
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
    name: "quoteOpenFee",
    stateMutability: "pure",
    inputs: [{ name: "suspects", type: "uint8" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getTestimony",
    stateMutability: "view",
    inputs: [
      { name: "caseId", type: "uint256" },
      { name: "questionId", type: "uint16" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "guiltOf",
    stateMutability: "view",
    inputs: [
      { name: "caseId", type: "uint256" },
      { name: "seat", type: "uint8" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "liarOf",
    stateMutability: "view",
    inputs: [
      { name: "caseId", type: "uint256" },
      { name: "seat", type: "uint8" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "verdictHandle",
    stateMutability: "view",
    inputs: [{ name: "caseId", type: "uint256" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "getCase",
    stateMutability: "view",
    inputs: [{ name: "caseId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "detective", type: "address" },
          { name: "suspects", type: "uint8" },
          { name: "liars", type: "uint8" },
          { name: "focusLeft", type: "uint8" },
          { name: "questionsAsked", type: "uint8" },
          { name: "accusedSeat", type: "uint8" },
          { name: "turnAt", type: "uint8" },
          { name: "turned", type: "bool" },
          { name: "solved", type: "bool" },
          { name: "status", type: "uint8" },
          { name: "openedAt", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "streak",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "event",
    name: "CaseOpened",
    inputs: [
      { name: "caseId", type: "uint256", indexed: true },
      { name: "detective", type: "address", indexed: true },
      { name: "suspects", type: "uint8" },
      { name: "liars", type: "uint8" },
      { name: "focus", type: "uint8" },
      { name: "turnAt", type: "uint8" },
    ],
  },
  {
    type: "event",
    name: "Interrogated",
    inputs: [
      { name: "caseId", type: "uint256", indexed: true },
      { name: "detective", type: "address", indexed: true },
      { name: "questionId", type: "uint16" },
      { name: "witness", type: "uint8" },
      { name: "mask", type: "uint16" },
      { name: "cost", type: "uint8" },
      { name: "answerHandle", type: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "WitnessTurned",
    inputs: [
      { name: "caseId", type: "uint256", indexed: true },
      { name: "witness", type: "uint8" },
    ],
  },
  {
    type: "event",
    name: "Accused",
    inputs: [
      { name: "caseId", type: "uint256", indexed: true },
      { name: "detective", type: "address", indexed: true },
      { name: "seat", type: "uint8" },
      { name: "verdict", type: "bytes32" },
      { name: "guiltHandles", type: "bytes32[]" },
      { name: "liarHandles", type: "bytes32[]" },
    ],
  },
] as const;

export const REWARDS_ABI = [
  {
    type: "function",
    name: "claimTickets",
    stateMutability: "nonpayable",
    inputs: [{ name: "caseId", type: "uint256" }],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "ticketsEarned",
    stateMutability: "view",
    inputs: [{ name: "caseId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "fundedTicketsRemaining",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "rewarded",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;
