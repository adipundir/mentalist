"use client";

import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { activeChain } from "@/lib/network";

const queryClient = new QueryClient();

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

/**
 * WalletConnect adds mobile/QR wallets but needs a project id. Without one we fall back to
 * injected connectors, which is enough to play, so a missing id degrades the wallet list
 * rather than breaking the page.
 */
const config = projectId
  ? getDefaultConfig({
      appName: "MENTALIST",
      projectId,
      chains: [activeChain],
      ssr: true,
    })
  : createConfig({
      chains: [activeChain],
      transports: { [activeChain.id]: http() },
      ssr: true,
      // EIP-6963 discovery is switched off deliberately. Some wallets announce themselves
      // more than once, Phantom notably so, and RainbowKit keys its list on the announced
      // id, which throws a duplicate-key error and can drop or duplicate entries. One
      // explicit injected connector is both stabler and honest about what this build
      // supports without a WalletConnect project id.
      multiInjectedProviderDiscovery: false,
      connectors: [injected()],
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
