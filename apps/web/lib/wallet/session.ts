/**
 * Where AppKit keeps its connection status in `localStorage`: "connected" once a wallet
 * connects, "disconnected" once it disconnects. AppKit restores the session from its own
 * storage when it starts.
 */
export const APPKIT_CONNECTION_STATUS_KEY = "@appkit/connection_status";

/**
 * Whether this browser remembers a connected wallet, so the page loads the wallet once idle
 * and shows the visitor's address. False when the storage can't be read (a private window,
 * blocked storage).
 */
export function hasStoredWalletSession(storage: Pick<Storage, "getItem">): boolean {
  try {
    return storage.getItem(APPKIT_CONNECTION_STATUS_KEY) === "connected";
  } catch {
    return false;
  }
}

/**
 * Runs in `<head>`, before the first paint: sets `<html data-wallet="restoring">` when this
 * browser remembers a connected wallet, so what offers to connect looks like a placeholder
 * until the wallet is back (`globals.css`), and sets nothing otherwise or when the storage
 * can't be read.
 */
export const WALLET_SESSION_SCRIPT = `(function(){try{if(localStorage.getItem("${APPKIT_CONNECTION_STATUS_KEY}")==="connected")document.documentElement.dataset.wallet="restoring"}catch(e){}})()`;
