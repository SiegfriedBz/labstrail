import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const setThemeMode = vi.fn();
const createAppKit = vi.fn((_options: { themeMode?: string }) => ({ setThemeMode }));
vi.mock("@reown/appkit/react", () => ({ createAppKit }));
vi.mock("@reown/appkit/networks", () => ({ baseSepolia: { id: 84532 } }));
vi.mock("@reown/appkit-adapter-wagmi", () => ({
  WagmiAdapter: class {
    wagmiConfig = {};
  },
}));
vi.mock("wagmi", () => ({ WagmiProvider: ({ children }: { children: ReactNode }) => children }));

document.documentElement.dataset.theme = "dark";
const { Providers } = await import("./providers.tsx");

describe("Providers", () => {
  afterEach(cleanup);

  it("opens AppKit's window in the page's theme, and keeps it in step when it changes", async () => {
    render(
      <Providers projectId="test-project">
        <p>page</p>
      </Providers>,
    );

    expect(screen.getByText("page")).toBeTruthy();
    expect(createAppKit.mock.calls[0]?.[0].themeMode).toBe("dark");
    await act(async () => {
      document.documentElement.dataset.theme = "light";
      await Promise.resolve();
    });
    expect(setThemeMode).toHaveBeenLastCalledWith("light");
  });

  it("renders the page without AppKit when no project id is set", () => {
    render(
      <Providers projectId={undefined}>
        <p>page</p>
      </Providers>,
    );

    expect(screen.getByText("page")).toBeTruthy();
  });
});
