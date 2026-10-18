import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JsonLd } from "./json-ld.tsx";

describe("JsonLd", () => {
  afterEach(cleanup);

  it("holds the structured data in one script, with < escaped", () => {
    const { container } = render(<JsonLd data={{ "@type": "Thing", name: "Bees </script>" }} />);

    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.textContent).toBe('{"@type":"Thing","name":"Bees \\u003c/script>"}');
  });
});
