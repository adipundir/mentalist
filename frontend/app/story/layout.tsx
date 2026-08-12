import "@rainbow-me/rainbowkit/styles.css";
import { Providers } from "@/components/Providers";

/**
 * Every case runs on-chain, so the wallet stack is required here. Connecting is asked for
 * at the gate rather than mid-game.
 */
export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
