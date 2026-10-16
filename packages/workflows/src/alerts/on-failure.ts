import type { Inngest } from "inngest";
import { z } from "zod";

/** Inngest's event for a run that failed for good, after its retries. */
export const FUNCTION_FAILED = "inngest/function.failed";

/** The longest error text an alert carries. */
const MAX_ERROR_CHARS = 300;

const failureSchema = z.object({
  function_id: z.string(),
  run_id: z.string(),
  error: z.object({ message: z.string() }),
});

/**
 * The alert for a failed run (ADR 0038): the function, the run, and the first line of the
 * error, whose `publish-failed:` / `rating-failed:` / `oracle-failed:` prefix says why, cut at
 * 300 characters. `undefined` for this function's own failures, so a failing alert never
 * alerts again, and for data that is not a failure.
 */
export function failureText(data: unknown): string | undefined {
  const parsed = failureSchema.safeParse(data);
  if (!parsed.success || parsed.data.function_id.endsWith("alert-on-failure")) return undefined;
  const { function_id, run_id, error } = parsed.data;
  const line = error.message.split("\n", 1)[0] ?? "";
  const reason = line.length > MAX_ERROR_CHARS ? `${line.slice(0, MAX_ERROR_CHARS)}…` : line;
  return `${function_id} failed (run ${run_id}): ${reason}`;
}

/**
 * The `alert-on-failure` Inngest function: on every function's `inngest/function.failed`,
 * sends the maintainer one alert from a step (`alert`, never throwing). A run that stops
 * because a service is down, a scorer outage included, is how the maintainer hears of it.
 */
export function createFailureAlerts(inngest: Inngest.Any, alert: (text: string) => Promise<void>) {
  return inngest.createFunction(
    { id: "alert-on-failure", triggers: [{ event: FUNCTION_FAILED }] },
    async ({ event, step }) =>
      alertOnFailure(event.data, { run: (id, fn) => step.run(id, fn) as never }, alert),
  );
}

/** The step tool a failure alert uses; tests pass a fake. */
export interface FailureAlertSteps {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

/**
 * Alerts on one `inngest/function.failed` event's `data`, from a step (`alert`), when
 * {@link failureText} gives a text for it.
 */
export async function alertOnFailure(
  data: unknown,
  step: FailureAlertSteps,
  alert: (text: string) => Promise<void>,
): Promise<{ readonly alerted: boolean }> {
  const text = failureText(data);
  if (text) await step.run("alert", () => alert(text).then(() => null));
  return { alerted: Boolean(text) };
}
