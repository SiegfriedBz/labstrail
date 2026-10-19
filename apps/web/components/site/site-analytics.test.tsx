import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics/next", () => ({ Analytics: () => <i>Vercel Web Analytics</i> }));

const { SiteAnalytics } = await import("./site-analytics.tsx");

describe("SiteAnalytics", () => {
  afterEach(cleanup);

  it("counts visits on production", () => {
    render(<SiteAnalytics appEnv="production" />);

    expect(screen.getByText("Vercel Web Analytics")).toBeTruthy();
  });

  it.each(["staging", "local"] as const)("counts nothing on %s", (appEnv) => {
    render(<SiteAnalytics appEnv={appEnv} />);

    expect(screen.queryByText("Vercel Web Analytics")).toBeNull();
  });
});
