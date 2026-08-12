import "./globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Special_Elite, Crimson_Pro } from "next/font/google";

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
    "A confidential deduction game on Base. The evidence is encrypted, testimony passes through a hidden honesty bit, and nobody, not even the deployer, knows who Red John is.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning lang="en">
      <body
        suppressHydrationWarning
        className={`grain vignette min-h-screen ${mono.variable} ${typewriter.variable} ${body.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
