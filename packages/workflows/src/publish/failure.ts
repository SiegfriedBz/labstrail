/** The longest description {@link describeFailure} gives. */
const MAX_CHARS = 200;

/** What a log line never carries: addresses, credentials and long hex such as a signature. */
const SECRETS: readonly [RegExp, string][] = [
  [/\b[a-z][a-z\d+.-]*:\/\/\S+/giu, "<url>"],
  [/\bBearer\s+\S+/giu, "Bearer <redacted>"],
  [/\beyJ[\w-]*\.[\w-]+\.[\w-]*/gu, "<redacted>"],
  [/\b0x[\da-f]{16,}/giu, "<hex>"],
];

/**
 * A thrown value as one short line for a log, with its cause's message when it has one
 * (a refused connection names its address and port): an error's `shortMessage` (viem's) or
 * first line of its message, with URLs, bearer tokens, JWTs and long hex replaced, at most
 * 200 characters.
 */
export function describeFailure(error: unknown): string {
  const message = firstLine(error);
  const cause = error instanceof Error ? firstLine(error.cause) : undefined;
  const described = cause && !message.includes(cause) ? `${message} (${cause})` : message;
  const safe = SECRETS.reduce((text, [pattern, mask]) => text.replace(pattern, mask), described);
  return (safe || "unknown error").slice(0, MAX_CHARS);
}

function firstLine(value: unknown): string {
  if (value === undefined || value === null) return "";
  const short = (value as { shortMessage?: unknown }).shortMessage;
  const text =
    typeof short === "string" ? short : value instanceof Error ? value.message : String(value);
  return text.trim().split("\n", 1)[0]?.trim() ?? "";
}
