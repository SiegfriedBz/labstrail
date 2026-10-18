/**
 * How long a pending rating counts as on time: a run that scores at once finishes within a few
 * minutes, and its first two retries, 2 then 5 minutes apart, about 10 when the scoring model
 * is busy (ADR 0009); past 15 minutes it is waiting out an outage, 15, 30 then 60 minutes apart.
 */
export const SLOW_AFTER_MS = 15 * 60_000;

/** When a rating was requested, from its chain time (`requestedAt`, seconds) and `nowMs`. */
export function requestedAgo(requestedAt: number, nowMs: number): string {
  const minutes = Math.floor(Math.max(0, nowMs - requestedAt * 1000) / 60_000);
  if (minutes < 1) return "Requested just now";
  if (minutes < 60) return `Requested ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `Requested ${hours} h ago` : `Requested ${hours} h ${rest} min ago`;
}

/** Whether a pending rating requested at `requestedAt` (seconds) has run past {@link SLOW_AFTER_MS}. */
export function takingLong(requestedAt: number, nowMs: number): boolean {
  return nowMs - requestedAt * 1000 > SLOW_AFTER_MS;
}
