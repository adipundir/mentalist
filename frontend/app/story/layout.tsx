import "@rainbow-me/rainbowkit/styles.css";
import { Providers } from "@/components/Providers";

/**
 * The campaign can be played on-chain, so it needs the wallet stack. Practice mode still
 * works without ever touching it — connecting is offered at the mode picker, not demanded
 * at the door.
 */
export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
