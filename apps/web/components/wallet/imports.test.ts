import { describe, expect, it } from "vitest";

declare global {
  interface ImportMeta {
    /** Vite's glob import with `?raw`, resolved by Vitest: each file's source by its path. */
    glob(
      patterns: string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, string>;
  }
}

/** A runtime import or re-export of AppKit or wagmi; `import type` is erased, so it is allowed. */
const WALLET_IMPORT =
  /^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+["'](?:@reown\/[^"']+|wagmi(?:\/[^"']*)?)["']|\bimport\(\s*["'](?:@reown\/|wagmi)/m;

/**
 * The one module allowed to import them, reached only through `import()`, its test, and this
 * file (paths as Vite gives them, relative to this folder).
 */
const RUNTIME = ["./wallet-runtime.ts", "./wallet-runtime.test.ts", "./imports.test.ts"];

const sources = import.meta.glob(
  ["../../app/**/*.{ts,tsx}", "../../components/**/*.{ts,tsx}", "../../lib/**/*.{ts,tsx}"],
  { query: "?raw", import: "default", eager: true },
);

describe("the wallet's libraries", () => {
  it("recognises a runtime import, and lets a type import through", () => {
    expect(WALLET_IMPORT.test('import { useAccount } from "wagmi";')).toBe(true);
    expect(WALLET_IMPORT.test('import {\n  createAppKit,\n} from "@reown/appkit";')).toBe(true);
    expect(WALLET_IMPORT.test('import { getAccount } from "wagmi/actions";')).toBe(true);
    expect(WALLET_IMPORT.test('const m = await import("@reown/appkit");')).toBe(true);
    expect(WALLET_IMPORT.test('import type { Config } from "wagmi";')).toBe(false);
  });

  it("are imported only by the wallet's runtime, so no page carries them before a wallet action", () => {
    const files = Object.entries(sources);
    const importers = files
      .filter(([path]) => !RUNTIME.includes(path))
      .filter(([, source]) => WALLET_IMPORT.test(source))
      .map(([path]) => path);

    expect(files.length).toBeGreaterThan(50);
    expect(importers).toEqual([]);
  });
});
