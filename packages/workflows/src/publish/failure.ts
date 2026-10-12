/** The longest description {@link describeFailure} gives. */
const MAX_CHARS = 200;

/** What a log line never carries: addresses, credentials and long hex such as a signature. */
const SECRETS: readonly [RegExp, string][] = [
  [/\b[a-z][a-z\d+.-]*:\/\/\S+/giu, "<url>"],
  [/\bBearer\s+\S+/giu, "Bearer <redacted>"],
  [/\beyJ[\w-]*\.[\w-]+\.[\w-]*/gu, "<redacted>"],
  [/\b0x[\da-f]{16,}/giu, "<hex>"],
];

/** How many causes deep a description reads: viem's error wraps fetch's, which wraps the socket's. */
const MAX_CAUSES = 3;

/**
 * A thrown value as one short line for a log: an error's `shortMessage` (viem's) or the
 * first line of its message, then what it says beyond that, in brackets: its HTTP `status`,
 * and its causes, up to three deep (a refused connection names its address and port; a
 * cause with no message gives its first grouped error's, as Node's `AggregateError` holds
 * one per address, or its `code`). URLs, bearer tokens, JWTs and long hex are replaced, and
 * the line is at most 200 characters.
 */
export function describeFailure(error: unknown): string {
  const message = explain(error);
  const status = (error as { status?: unknown } | undefined)?.status;
  const details = typeof status === "number" ? [`HTTP ${status}`] : [];
  let cause = error instanceof Error ? error.cause : undefined;
  for (let depth = 0; depth < MAX_CAUSES && cause !== undefined; depth++) {
    const explained = explain(cause);
    if (explained && !message.includes(explained) && !details.includes(explained))
      details.push(explained);
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  const described = details.length > 0 ? `${message} (${details.join(": ")})` : message;
  const safe = SECRETS.reduce((text, [pattern, mask]) => text.replace(pattern, mask), described);
  return (safe || "unknown error").slice(0, MAX_CHARS);
}

/** A value's own first line, else its first grouped error's, else its `code`. */
function explain(value: unknown): string {
  const line = firstLine(value);
  if (line) return line;
  const [first] = value instanceof AggregateError ? value.errors : [];
  const grouped = firstLine(first);
  if (grouped) return grouped;
  const code = (value as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : "";
}

function firstLine(value: unknown): string {
  if (value === undefined || value === null) return "";
  const short = (value as { shortMessage?: unknown }).shortMessage;
  const text =
    typeof short === "string" ? short : value instanceof Error ? value.message : String(value);
  return text.trim().split("\n", 1)[0]?.trim() ?? "";
}
