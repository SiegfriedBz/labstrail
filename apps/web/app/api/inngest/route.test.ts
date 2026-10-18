// @vitest-environment node
import { describe, expect, it } from "vitest";

/** The route as the Inngest dev server reaches it locally (`APP_ENV` defaults to `local`). */
function route() {
  return import("./route.ts");
}

// The first import compiles the whole workflows package, which can take over Vitest's default
// 5 s while every workspace tests at once.
describe("/api/inngest", { timeout: 30_000 }, () => {
  it("answers Inngest's GET, POST and PUT", async () => {
    const { GET, POST, PUT } = await route();

    expect([GET, POST, PUT].every((handler) => typeof handler === "function")).toBe(true);
  });

  it("describes the workflows' functions to the dev server: publish and the failure alerts, with no oracle key", async () => {
    const { GET } = await route();

    const response = await GET(
      new Request("http://localhost:3000/api/inngest") as never,
      undefined as never,
    );
    const body = (await response.json()) as { function_count?: number };

    expect(response.status).toBe(200);
    expect(body.function_count).toBe(2);
  });
});
