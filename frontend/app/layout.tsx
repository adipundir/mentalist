import "./globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Special_Elite, Crimson_Pro } from "next/font/google";
import Script from "next/script";
import { NarrationToggle } from "@/components/NarrationToggle";

/** Data, addresses, the terminal panel. */
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

/** Typewriter, testimony, stamps, case headers. The voice of the file. */
const typewriter = Special_Elite({
  subsets: ["latin"],
  variable: "--font-type",
  weight: "400",
});

/** Body serif, prose, dossier copy. */
const body = Crimson_Pro({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "MENTALIST, everyone lies, Red John always does",
  description:
    "A confidential prediction market on Base. Seven rooms, one impossible alibi in each. The name you stake on is encrypted in your browser, and the winners split the pot in real Megapot tickets.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning lang="en">
      <body
        suppressHydrationWarning
        className={`grain vignette min-h-screen ${mono.variable} ${typewriter.variable} ${body.variable}`}
      >
        {children}
        {/* The sounds play on every screen, so the switch for them belongs on every screen. */}
        <NarrationToggle />

        {/* Vercel's analytics, loaded straight from the platform rather than through
            `@vercel/analytics`. Both are already provisioned on the project; the package
            only ever injects these two scripts, and adding it would mean resolving the
            whole workspace, which currently cannot be installed at all — a Safe contracts
            dependency is pinned to an SSH git URL that fails without keys. */}
        <Script src="/_vercel/insights/script.js" strategy="afterInteractive" />
        <Script src="/_vercel/speed-insights/script.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
