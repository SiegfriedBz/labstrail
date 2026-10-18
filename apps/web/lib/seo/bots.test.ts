// @vitest-environment node
import { readFileSync } from "node:fs";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";
import { describe, expect, it } from "vitest";
import { HTML_LIMITED_BOTS, isHtmlLimitedBot } from "./bots.ts";

describe("isHtmlLimitedBot", () => {
  it.each([
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
    "Twitterbot/1.0",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  ])("is true for %s", (userAgent) => {
    expect(isHtmlLimitedBot(userAgent)).toBe(true);
  });

  it.each([
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  ])("is false for %s, which runs JavaScript", (userAgent) => {
    expect(isHtmlLimitedBot(userAgent)).toBe(false);
  });

  it("is false with no user agent", () => {
    expect(isHtmlLimitedBot(null)).toBe(false);
  });

  it("keeps every bot of Next's own list", () => {
    expect(HTML_LIMITED_BOTS.startsWith(`${HTML_LIMITED_BOT_UA_RE.source}|`)).toBe(true);
  });

  it("is the list Next serves blocking metadata to", () => {
    const config = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");

    expect(config).toMatch(/htmlLimitedBots: new RegExp\(HTML_LIMITED_BOTS, "i"\)/);
  });
});
