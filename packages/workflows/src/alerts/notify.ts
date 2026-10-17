/** An alert asks the maintainer to act; activity says a paper was published or rated. */
export type NotifyLevel = "alert" | "activity";

/** One message for the maintainer's Telegram chat, in plain text: the notifier formats it. */
export interface Notice {
  readonly level: NotifyLevel;
  /** An alert's lines, or the headline of activity, its emoji first (`⭐ Rated 67/100`). */
  readonly text: string;
  /** The paper the message is about, shown in bold under the headline. */
  readonly title?: string | undefined;
  /** A page to open, shown as its label (`Open the rating`). */
  readonly link?: { readonly label: string; readonly url: string } | undefined;
}

/** What {@link createNotify} needs: the chat, and the IO it sends and logs with. */
export interface NotifyOptions {
  /** The environment, which prefixes every message: one chat serves them all. */
  readonly appEnv: string;
  /** The bot's token. Secret: never logged. Without it, or the chat, messages are only logged. */
  readonly botToken: string | undefined;
  readonly chatId: string | undefined;
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  readonly timeoutMs: number;
  readonly logger: { info(message: string): void; warn(message: string): void };
}

/** Sends one notice; it resolves even when Telegram does not answer. */
export type Notify = (notice: Notice) => Promise<void>;

/**
 * Builds the one way the workflows tell the maintainer something (ADR 0038): a Telegram
 * `sendMessage` to one chat, in Telegram's HTML: a bold headline (`🚨 Alert` for an alert, the
 * notice's text for activity) and the environment, then an alert's text, or the paper's title
 * in bold, and the link as its label; everything the notice holds is escaped. Without a bot
 * token and chat (locally), it logs the message as one plain line
 * (`[staging · alert] …`) instead. A failed send is logged as `notify-unavailable: telegram: …`
 * and never thrown, so a notification never fails the run that sends it.
 */
export function createNotify(options: NotifyOptions): Notify {
  const { appEnv, botToken, chatId, logger } = options;
  return async (notice) => {
    const { level } = notice;
    if (!botToken || !chatId) {
      const line = `notify: ${plainLine(appEnv, notice)}`;
      if (level === "alert") logger.warn(line);
      else logger.info(line);
      return;
    }
    const message = telegramHtml(appEnv, notice);
    try {
      const response = await options.fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (!response.ok) logger.warn(`notify-unavailable: telegram: HTTP ${response.status}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.warn(`notify-unavailable: telegram: ${detail.replaceAll(botToken, "<token>")}`);
    }
  };
}

/** A notice as one log line: `[staging · activity] 📄 Published: <title> <url>`. */
function plainLine(appEnv: string, { level, text, title, link }: Notice): string {
  return `[${appEnv} · ${level}] ${text}${title ? `: ${title}` : ""}${link ? ` ${link.url}` : ""}`;
}

/** A notice in Telegram's HTML, each part escaped so a title never breaks the formatting. */
function telegramHtml(appEnv: string, { level, text, title, link }: Notice): string {
  const lines =
    level === "alert"
      ? [`<b>🚨 Alert</b> · ${escapeHtml(appEnv)}`, escapeHtml(text)]
      : [`<b>${escapeHtml(text)}</b> · ${escapeHtml(appEnv)}`];
  if (title) lines.push(`<b>${escapeHtml(title)}</b>`);
  if (link) lines.push(`→ <a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>`);
  return lines.join("\n");
}

/** Escapes the characters Telegram's HTML reads: `&`, `<`, `>` and, in a link, `"`. */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
