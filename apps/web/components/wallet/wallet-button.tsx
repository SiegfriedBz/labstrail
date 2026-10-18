"use client";

import { Wallet, Warning } from "@phosphor-icons/react";
import { shorten } from "../../lib/shorten.ts";
import { useWallet, useWalletReady } from "./providers.tsx";

/** The header's wallet button, neutral so each page's own call to action leads. */
const BUTTON =
  "inline-flex h-9 min-w-9 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-line-strong bg-surface-strong px-2 text-sm font-medium text-ink sm:px-3 transition hover:border-accent/40 hover:bg-accent-soft active:scale-[0.98] disabled:cursor-wait";

/**
 * The wallet button. Before the wallet loads it offers Connect, starting the download when the
 * pointer, focus or a touch reaches it, and opens AppKit's window on a click once loaded. While
 * a stored session comes back it is a placeholder of the same size; once connected it shows
 * the address in short form and opens AppKit's account window. On a phone it is a wallet icon
 * (with a dot once connected), so the header keeps one line.
 */
export function WalletButton() {
  const wallet = useWallet();
  if (!useWalletReady()) {
    return <span className="text-sm text-muted">Wallet not set up</span>;
  }

  const open = () => {
    void wallet.load().then(
      (runtime) => runtime.open(),
      () => {},
    );
  };

  if (wallet.status === "restoring") {
    return (
      <button type="button" disabled aria-busy aria-label="Wallet loading" className={BUTTON}>
        <span aria-hidden className="block h-4 w-5 animate-pulse rounded-md bg-line sm:w-24" />
      </button>
    );
  }

  if (wallet.status === "connected" && wallet.account) {
    const short = shorten(wallet.account.address, 6, 4);
    return (
      <button
        type="button"
        onClick={open}
        aria-label={`Wallet ${short}, open account`}
        title={wallet.account.address}
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
        <span className="hidden font-mono text-xs sm:inline">{short}</span>
      </button>
    );
  }

  const failed = wallet.status === "failed";
  const loading = wallet.status === "loading";
  const label = failed ? "Retry wallet" : "Connect wallet";
  return (
    <button
      type="button"
      onClick={open}
      onPointerEnter={wallet.preload}
      onFocus={wallet.preload}
      onTouchStart={wallet.preload}
      disabled={loading}
      aria-busy={loading}
      aria-label={label}
      data-wallet-connect
      className={BUTTON}
    >
      {/* A phone's header also holds the logo, two links and the theme button: an icon fits. */}
      {failed ? (
        <Warning aria-hidden size={18} className="text-danger sm:hidden" />
      ) : (
        <Wallet aria-hidden size={18} className="sm:hidden" />
      )}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
