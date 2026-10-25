import type { Inngest } from "inngest";
import { z } from "zod";
import { delayedFailureOf } from "../rating/rate-paper.ts";

/** Inngest's event for a run that failed for good, after its retries. */
export const FUNCTION_FAILED = "inngest/function.failed";

/**
 * Inngest's event for a cancelled run: one past its time budget (`timeouts.finish`), or one
 * cancelled by hand or through the API.
 */
export const FUNCTION_CANCELLED = "inngest/function.cancelled";

/** The longest error text an alert carries. */
const MAX_ERROR_CHARS = 300;

/** What the alert reads of either event: a cancel's data may carry only the ids. */
const failureSchema = z.object({
  function_id: z.string(),
  run_id: z.string(),
  error: z.object({ message: z.string() }).optional(),
});

/**
 * The alert for a failed or cancelled run (ADR 0038): the function, the run, and for a failure
 * the first line of the error, whose `publish-failed:` / `rating-failed:` / `oracle-failed:`
 * prefix says why, cut at 300 characters; a cancel's error says nothing more than "function
 * cancelled". `undefined` for this function's own runs, so a failing alert never alerts again,
 * for a rating run that failed with a `rating-failed:<reason>:` its run reported as a
 * `⏳ Rating delayed` message (`DELAYED_FAILURES`), and for data that is not a failure.
 */
export function failureText(
  data: unknown,
  ended: "failed" | "cancelled" = "failed",
): string | undefined {
  const parsed = failureSchema.safeParse(data);
  if (!parsed.success || parsed.data.function_id.endsWith("alert-on-failure")) return undefined;
  const { function_id, run_id, error } = parsed.data;
  if (ended === "cancelled") {
    return `${function_id} cancelled (run ${run_id}): past its time budget, or by hand`;
  }
  const line = error?.message.split("\n", 1)[0] ?? "";
  if (function_id.endsWith("rate-paper") && line.startsWith("rating-failed:")) {
    if (delayedFailureOf(line)) return undefined;
  }
  const reason = line.length > MAX_ERROR_CHARS ? `${line.slice(0, MAX_ERROR_CHARS)}…` : line;
  return `${function_id} failed (run ${run_id}): ${reason}`;
}

/**
 * The `alert-on-failure` Inngest function: on every function's `inngest/function.failed` and
 * `inngest/function.cancelled`, sends the maintainer one alert from a step (`alert`, never
 * throwing). A run that stops on a failure the maintainer must fix, or that runs past its time
 * budget, is how the maintainer hears of it; a rating run that gave up while its request stays
 * pending sent its own `⏳ Rating delayed` message instead.
 */
export function createFailureAlerts(inngest: Inngest.Any, alert: (text: string) => Promise<void>) {
  return inngest.createFunction(
    {
      id: "alert-on-failure",
      triggers: [{ event: FUNCTION_FAILED }, { event: FUNCTION_CANCELLED }],
    },
    async ({ event, step }) =>
      alertOnFailure(
        { name: event.name, data: event.data },
        { run: (id, fn) => step.run(id, fn) as never },
        alert,
      ),
  );
}

/** The step tool a failure alert uses; tests pass a fake. */
export interface FailureAlertSteps {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

/**
 * Alerts on one `inngest/function.failed` or `inngest/function.cancelled` event, from a step
 * (`alert`), when {@link failureText} gives a text for it.
 */
export async function alertOnFailure(
  event: { readonly name: string; readonly data: unknown },
  step: FailureAlertSteps,
  alert: (text: string) => Promise<void>,
): Promise<{ readonly alerted: boolean }> {
  const text = failureText(event.data, event.name === FUNCTION_CANCELLED ? "cancelled" : "failed");
  if (text) await step.run("alert", () => alert(text).then(() => null));
  return { alerted: Boolean(text) };
}
