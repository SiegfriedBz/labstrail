import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";

/**
 * The crawlers that read a page's HTML without running JavaScript, as a case-insensitive
 * pattern: Next's own list, which it serves blocking metadata to, and the AI search and
 * training crawlers it leaves out. Next's list is imported from its module
 * (`next/dist/shared/lib/router/utils/html-bots.js`), not copied, so an upgrade that adds a
 * bot adds it here too, and one that moves the module fails the build rather than drifting. `next.config.ts`
 * sets it as `htmlLimitedBots`, so their metadata is in the `<head>`; the paper and rating pages
 * render their body without streaming for them ({@link isHtmlLimitedBot}). Googlebot runs
 * JavaScript, so it gets the streamed page.
 */
export const HTML_LIMITED_BOTS = [
  HTML_LIMITED_BOT_UA_RE.source,
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
].join("|");

const PATTERN = new RegExp(HTML_LIMITED_BOTS, "i");

/** Whether a request's user agent is one of {@link HTML_LIMITED_BOTS}; `false` with none. */
export function isHtmlLimitedBot(userAgent: string | null): boolean {
  return userAgent !== null && PATTERN.test(userAgent);
}
