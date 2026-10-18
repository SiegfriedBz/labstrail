import { describe, expect, it } from "vitest";
import * as site from "../../../../opengraph-image.tsx";
import * as rating from "./opengraph-image.tsx";

describe("a rating's share image", () => {
  it("is the site's card, never its paper's, whose score may be another rating's", () => {
    expect(rating.default).toBe(site.default);
    expect(rating.alt).toBe(site.alt);
    expect(rating.size).toEqual(site.size);
    expect(rating.contentType).toBe("image/png");
  });
});
