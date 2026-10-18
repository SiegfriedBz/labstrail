import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollToRating } from "./scroll-to-rating.tsx";

function section() {
  return (
    <section id="rating">
      <ScrollToRating />
    </section>
  );
}

describe("ScrollToRating", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("scrolls the rating section into view when the page was opened at #rating", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    window.history.replaceState(null, "", "/papers/bafy1#rating");

    render(section());

    expect(scroll).toHaveBeenCalledTimes(1);
    expect((scroll.mock.contexts[0] as Element).id).toBe("rating");
  });

  it("leaves the page where it is without the hash", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    window.history.replaceState(null, "", "/papers/bafy1");

    render(section());

    expect(scroll).not.toHaveBeenCalled();
  });
});
