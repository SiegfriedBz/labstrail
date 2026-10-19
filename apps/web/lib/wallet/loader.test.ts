import { describe, expect, it, vi } from "vitest";
import { createWalletLoader } from "./loader.ts";

describe("createWalletLoader", () => {
  it("builds once: calls made before the build ends share it, and later calls get the same result", async () => {
    let finish: (value: { id: string }) => void = () => {};
    const build = vi.fn(
      (_settings: string) =>
        new Promise<{ id: string }>((resolve) => {
          finish = resolve;
        }),
    );
    const loader = createWalletLoader(build);

    const first = loader.load("settings");
    const second = loader.load("settings");
    expect(loader.current()).toBeUndefined();
    finish({ id: "runtime" });

    expect(await first).toBe(await second);
    expect(await loader.load("settings")).toEqual({ id: "runtime" });
    expect(loader.current()).toEqual({ id: "runtime" });
    expect(build).toHaveBeenCalledOnce();
    expect(build).toHaveBeenCalledWith("settings");
  });

  it("rejects with the build's error and builds again on the next call", async () => {
    const chunkError = new Error("Loading chunk failed");
    const build = vi
      .fn<(settings: string) => Promise<string>>()
      .mockRejectedValueOnce(chunkError)
      .mockResolvedValueOnce("runtime");
    const loader = createWalletLoader(build);

    await expect(loader.load("settings")).rejects.toBe(chunkError);
    expect(loader.current()).toBeUndefined();
    expect(await loader.load("settings")).toBe("runtime");
    expect(build).toHaveBeenCalledTimes(2);
  });
});
