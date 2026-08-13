"use client";

import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import {
  connectorsForWallets,
  getDefaultConfig,
  getDefaultWallets,
  RainbowKitProvider,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import {
  braveWallet,
  coinbaseWallet,
  injectedWallet,
  okxWallet,
  phantomWallet,
  rabbyWallet,
  trustWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { activeChain } from "@/lib/network";

const queryClient = new QueryClient();

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

/**
 * A named wallet list instead of whatever the page announces about itself.
 *
 * EIP-6963 discovery is deduplicated by uuid rather than by wallet id, and Phantom announces
 * itself more than once with a fresh uuid each time. Two announcements become two connectors
 * carrying the same `app.phantom` id, React sees two children under one key in the wallet
 * modal, and warns. Naming the wallets ourselves gives exactly one entry per wallet, and
 * `injectedWallet` at the end still catches whatever else the browser has installed.
 */
const { wallets: popular } = getDefaultWallets();

/** Everything that connects straight from the browser, with or without a project id. */
const INSTALLED = {
  groupName: "Installed",
  wallets: [coinbaseWallet, phantomWallet, rabbyWallet, braveWallet, injectedWallet],
};

const wallets = [
  ...popular,
  { groupName: "More", wallets: [okxWallet, trustWallet, ...INSTALLED.wallets] },
];

const config = projectId
  ? getDefaultConfig({
      appName: "MENTALIST",
      projectId,
      chains: [activeChain],
      wallets,
      // Off, or the discovered duplicates come straight back in beside the named list.
      multiInjectedProviderDiscovery: false,
      ssr: true,
    })
  : createConfig({
      chains: [activeChain],
      transports: { [activeChain.id]: http() },
      // WalletConnect adds mobile and QR wallets but needs a project id, so without one the
      // list is the browser's own wallets. Named rather than discovered for the same reason
      // as above, and none of these needs a project id to connect.
      connectors: connectorsForWallets([INSTALLED], { appName: "MENTALIST", projectId: "" }),
      multiInjectedProviderDiscovery: false,
      ssr: true,
    });

/**
 * RainbowKit ships a light-on-white button that reads as a different product bolted onto
 * the case file. Its theme is overridden to the game's palette, charcoal, bone, one blood
 * red, so the wallet modal belongs to the same world as everything around it.
 */
const noir = darkTheme({
  accentColor: "#c1272d",
  accentColorForeground: "#d8d2c4",
  borderRadius: "none",
  overlayBlur: "small",
});

noir.colors.modalBackground = "#1a1b1f";
noir.colors.modalBorder = "#222328";
noir.colors.modalText = "#d8d2c4";
noir.colors.modalTextSecondary = "#8a857a";
noir.colors.profileForeground = "#121316";
noir.colors.connectButtonBackground = "#1a1b1f";
noir.colors.connectButtonInnerBackground = "#121316";
noir.colors.connectButtonText = "#d8d2c4";
noir.fonts.body = "var(--font-mono), ui-monospace, monospace";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={noir}>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
