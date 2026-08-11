/** @type {import('next').NextConfig} */

/**
 * `@x402/*` are optional peers of @coinbase/cdp-sdk, which RainbowKit pulls in transitively
 * via @wagmi/connectors → @base-org/account. They sit behind lazy `import()` calls on a
 * Solana payment path this game never touches, but the bundler still has to resolve them
 * statically, so they are installed as devDependencies rather than stubbed out — stubbing
 * would silently mask a real dependency if that path ever became live.
 */
const nextConfig = {
  turbopack: {},
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
};

module.exports = nextConfig;
