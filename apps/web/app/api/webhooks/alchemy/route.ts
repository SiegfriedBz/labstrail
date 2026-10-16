import { getWebhookIntake } from "@verisci/workflows";

/**
 * Alchemy Notify's webhook (ADR 0017): hands the raw body and its `X-Alchemy Notify-Signature` to the
 * workflows' intake, which checks them and sends a rating event per request log, and answers its
 * status with an empty body: 200 ends the delivery, 503 has Alchemy Notify deliver again. Locally, and
 * where no signing key is set, it is 404 (`getWebhookIntake`).
 */
export async function POST(request: Request): Promise<Response> {
  const status = await getWebhookIntake().receive(
    await request.text(),
    request.headers.get("x-alchemy-signature"),
  );
  return new Response(null, { status });
}
