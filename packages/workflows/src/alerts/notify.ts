/** An alert asks the maintainer to act; activity says a paper was published or rated. */
export type NotifyLevel = "alert" | "activity";

/** One message for the maintainer's Telegram chat. */
export interface Notice {
  readonly level: NotifyLevel;
  readonly text: string;
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
 * `sendMessage` to one chat, each message prefixed with the environment and the level
 * (`[staging · alert] …`). Without a bot token and chat (locally), it logs the message instead.
 * A failed send is logged as `notify-unavailable: telegram: …` and never thrown, so a
 * notification never fails the run that sends it.
 */
export function createNotify(options: NotifyOptions): Notify {
  const { appEnv, botToken, chatId, logger } = options;
  return async ({ level, text }) => {
    const message = `[${appEnv} · ${level}] ${text}`;
    if (!botToken || !chatId) {
      if (level === "alert") logger.warn(`notify: ${message}`);
      else logger.info(`notify: ${message}`);
      return;
    }
    try {
      const response = await options.fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (!response.ok) logger.warn(`notify-unavailable: telegram: HTTP ${response.status}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.warn(`notify-unavailable: telegram: ${detail.replaceAll(botToken, "<token>")}`);
    }
  };
}
