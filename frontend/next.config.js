/** @type {import('next').NextConfig} */

/**
 * RainbowKit → @wagmi/connectors → @base-org/account → @coinbase/cdp-sdk reaches for
 * `@x402/*` and a few Node-only helpers behind lazy `import()` calls that only run on the
 * Solana payment path we never touch. They are optional peers and aren't installed, which
 * is fine at runtime but fatal to the bundler's static analysis. Alias them to an empty
 * module so the graph resolves; nothing here is ever executed.
 */
const UNUSED_OPTIONAL_DEPS = [
  "@x402/core/client",
  "@x402/svm/exact/client",
  "@x402/evm/exact/client",
  "@x402/core",
  "@x402/svm",
  "@x402/evm",
];

const nextConfig = {
  turbopack: {
    resolveAlias: Object.fromEntries(
      UNUSED_OPTIONAL_DEPS.map((m) => [m, "./lib/empty-module.js"]),
    ),
  },
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
};

module.exports = nextConfig;
