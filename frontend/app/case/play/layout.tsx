import "@rainbow-me/rainbowkit/styles.css";
import { Providers } from "@/components/Providers";

/**
 * Wallet providers live here, not in the root layout, so the landing page and the
 * no-wallet demo ship none of the wallet stack. The judge who never connects a wallet
 * never downloads one.
 */
export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
