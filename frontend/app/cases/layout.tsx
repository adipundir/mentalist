import "@rainbow-me/rainbowkit/styles.css";
import { Providers } from "@/components/Providers";

/**
 * The board reads live pots and your own entries straight from the market, so it needs the
 * wallet stack even before you connect: the pots are public, only "you played this" is not.
 */
export default function CasesLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
