import { describe, expect, it } from "vitest";
import { SITE, siteMetadata } from "./site.ts";

describe("SITE", () => {
  it("names VeriSci and says its field in the description", () => {
    expect(SITE.name).toBe("VeriSci");
    expect(SITE.description).toMatch(/life-science and health papers/);
    expect(SITE.description).not.toMatch(/[—–]/);
  });

  it("is the description of the page metadata, Open Graph and the Twitter card", () => {
    expect(siteMetadata).toMatchObject({
      title: SITE.name,
      description: SITE.description,
      openGraph: { title: SITE.name, description: SITE.description, siteName: SITE.name },
      twitter: { title: SITE.name, description: SITE.description },
    });
  });
});
