import { parseEther } from "viem";
import { describe, expect, it, vi } from "vitest";
import { fundOnAnvil } from "./fund.ts";

const ADDRESS = "0x9A17ec95E96f8a7C40B7Ac1411E8A844C7bF9111";

function chain(chainId = 31_337) {
  return { getChainId: vi.fn(async () => chainId), setBalance: vi.fn(async () => undefined) };
}

describe("fundOnAnvil", () => {
  it("gives the address 1 ETH on Anvil", async () => {
    const anvil = chain();

    expect(await fundOnAnvil(ADDRESS, anvil)).toEqual({ ok: true, address: ADDRESS });
    expect(anvil.setBalance).toHaveBeenCalledWith({ address: ADDRESS, value: parseEther("1") });
  });

  it("stops on a chain that is not Anvil, naming its chain id", async () => {
    const base = chain(84_532);

    expect(await fundOnAnvil(ADDRESS, base)).toEqual({
      ok: false,
      message: "chain id 84532 is not Anvil (31337)",
    });
    expect(base.setBalance).not.toHaveBeenCalled();
  });

  it.each(["0x12", "alice", ""])("stops on %j, which is not an address", async (input) => {
    const anvil = chain();

    expect(await fundOnAnvil(input, anvil)).toEqual({
      ok: false,
      message: `not an address: ${input}`,
    });
    expect(anvil.getChainId).not.toHaveBeenCalled();
  });
});
