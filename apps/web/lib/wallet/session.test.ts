import { afterEach, describe, expect, it } from "vitest";
import {
  APPKIT_CONNECTION_STATUS_KEY,
  hasStoredWalletSession,
  WALLET_SESSION_SCRIPT,
} from "./session.ts";

/** A storage holding only AppKit's connection status, or nothing. */
const storage = (status?: string): Pick<Storage, "getItem"> => ({
  getItem: (key) => (key === APPKIT_CONNECTION_STATUS_KEY ? (status ?? null) : null),
});

const blocked: Pick<Storage, "getItem"> = {
  getItem: () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
};

describe("hasStoredWalletSession", () => {
  it("is true when AppKit stored a connected status", () => {
    expect(hasStoredWalletSession(storage("connected"))).toBe(true);
  });

  it("is false when nothing is stored, or the status is disconnected", () => {
    expect(hasStoredWalletSession(storage())).toBe(false);
    expect(hasStoredWalletSession(storage("disconnected"))).toBe(false);
  });

  it("is false when the storage can't be read (a private window, blocked storage)", () => {
    expect(hasStoredWalletSession(blocked)).toBe(false);
  });
});

describe("WALLET_SESSION_SCRIPT", () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.wallet;
  });

  it("marks the page as restoring a wallet before the first paint when a session is stored", () => {
    localStorage.setItem(APPKIT_CONNECTION_STATUS_KEY, "connected");
    new Function(WALLET_SESSION_SCRIPT)();

    expect(document.documentElement.dataset.wallet).toBe("restoring");
  });

  it("marks nothing when no session is stored", () => {
    localStorage.setItem(APPKIT_CONNECTION_STATUS_KEY, "disconnected");
    new Function(WALLET_SESSION_SCRIPT)();

    expect(document.documentElement.dataset.wallet).toBeUndefined();
  });

  it("marks nothing, and throws nothing, when the storage can't be read", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    try {
      expect(() => new Function(WALLET_SESSION_SCRIPT)()).not.toThrow();
      expect(document.documentElement.dataset.wallet).toBeUndefined();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});
