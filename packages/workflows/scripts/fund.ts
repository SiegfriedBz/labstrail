import { type Address, isAddress, parseEther } from "viem";
import { anvil } from "viem/chains";

/** What funding needs from Anvil: its chain id, and its `anvil_setBalance` call. */
export interface AnvilFunder {
  getChainId(): Promise<number>;
  setBalance(args: { address: Address; value: bigint }): Promise<void>;
}

/**
 * Gives `input` 1 ETH on Anvil, so a browser wallet can request a rating locally (ADR 0036).
 * Refuses a string that is not an address (any case), and any chain but Anvil's (31337).
 */
export async function fundOnAnvil(
  input: string,
  chain: AnvilFunder,
): Promise<{ ok: true; address: Address } | { ok: false; message: string }> {
  if (!isAddress(input, { strict: false }))
    return { ok: false, message: `not an address: ${input}` };
  const chainId = await chain.getChainId();
  if (chainId !== anvil.id) {
    return { ok: false, message: `chain id ${chainId} is not Anvil (${anvil.id})` };
  }
  await chain.setBalance({ address: input, value: parseEther("1") });
  return { ok: true, address: input };
}
