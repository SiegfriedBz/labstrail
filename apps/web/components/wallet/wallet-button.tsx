"use client";

import { Wallet } from "@phosphor-icons/react";
import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";
import { shorten } from "../../lib/shorten.ts";
import { useWalletReady } from "./providers.tsx";

/** The header's wallet button, neutral so each page's own call to action leads. */
const BUTTON =
  "inline-flex h-9 min-w-9 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-line-strong bg-surface-strong px-2 text-sm font-medium text-ink sm:px-3 transition hover:border-accent/40 hover:bg-accent-soft active:scale-[0.98]";

/**
 * The wallet button: connects through AppKit's window, then shows the connected address in
 * short form and opens AppKit's account window. On a phone it is a wallet icon (with a dot
 * once connected), so the header keeps one line.
 */
export function WalletButton() {
  if (!useWalletReady()) {
    return <span className="text-sm text-muted">Wallet not set up</span>;
  }
  return <ConnectedWalletButton />;
}

function ConnectedWalletButton() {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  if (isConnected && address) {
    return (
      <button
        type="button"
        onClick={() => void open()}
        aria-label={`Wallet ${shorten(address, 6, 4)}, open account`}
        title={address}
        className={BUTTON}
      >
        <span className="relative sm:hidden">
          <Wallet aria-hidden size={18} />
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent ring-2 ring-page"
          />
        </span>
        <span aria-hidden className="hidden size-2 shrink-0 rounded-full bg-accent sm:block" />
        <span className="hidden font-mono text-xs sm:inline">{shorten(address, 6, 4)}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void open()}
      aria-label="Connect wallet"
      className={BUTTON}
    >
      {/* A phone's header also holds the logo, two links and the theme button: an icon fits. */}
      <Wallet aria-hidden size={18} className="sm:hidden" />
      <span className="hidden sm:inline">Connect wallet</span>
    </button>
  );
}
