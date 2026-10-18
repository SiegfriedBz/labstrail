import { describe, expect, it, vi } from "vitest";
import { paperTextOf, readPaperText } from "./paper-text.ts";
import { pdfOf, xmpOf } from "./test-pdf.ts";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const SENTENCE = "Patients were randomly assigned to citicoline or placebo in a one to one ratio.";
const TITLE = "Citicoline after acute ischaemic stroke: a randomised trial";

const LINES = Array.from({ length: 12 }, () => SENTENCE);
const PAPER_PDF = pdfOf(LINES);

function read(body: Uint8Array | string, status = 200, maxChars = 150_000) {
  const fetch = vi.fn(
    async () =>
      new Response(typeof body === "string" ? body : (body as Uint8Array<ArrayBuffer>), { status }),
  );
  const options = {
    gatewayUrl: "https://example.mypinata.cloud/",
    fetch,
    maxBytes: 15 * 1024 * 1024,
    timeoutMs: 60_000,
    maxChars,
  };
  return { fetch, result: readPaperText(CID, options) };
}

describe("readPaperText", () => {
  it("fetches the PDF through the gateway and returns its text, not its bytes", async () => {
    const { fetch, result } = read(PAPER_PDF);
    const answer = await result;

    expect(fetch).toHaveBeenCalledWith(
      `https://example.mypinata.cloud/ipfs/${CID}`,
      expect.anything(),
    );
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(Object.keys(answer)).toEqual(["ok", "paper"]);
    expect(answer.paper.text).toContain(SENTENCE);
    expect(answer.paper.shortened).toBe(false);
  });

  it("fits the text to maxChars", async () => {
    const answer = await read(PAPER_PDF, 200, 300).result;

    expect(answer).toMatchObject({ ok: true, paper: { shortened: true } });
    expect(answer.ok && answer.paper.text.length).toBeLessThanOrEqual(300);
  });

  it("is unreachable when the gateway does not answer with the file", async () => {
    expect(await read("busy", 503).result).toEqual({
      ok: false,
      reason: "unreachable",
      detail: "HTTP 503",
    });
  });

  it.each([
    ["a file that is not a PDF", new TextEncoder().encode("<html>not a pdf</html>")],
    ["a PDF that cannot be parsed", new TextEncoder().encode("%PDF-1.4\nthis is not a PDF body")],
  ])("is unreadable for %s", async (_, body) => {
    expect(await read(body).result).toEqual({ ok: false, reason: "unreadable" });
  });

  it("finds no text in a PDF without a text layer, such as a scan", async () => {
    expect(await read(pdfOf([])).result).toEqual({ ok: false, reason: "no-text" });
  });

  it.each([
    ["its info dictionary's title", { title: TITLE }],
    ["its XMP title, when the info dictionary has none", { xmp: xmpOf(TITLE) }],
    ["its info dictionary's title before its XMP one", { title: TITLE, xmp: xmpOf("Other") }],
  ])("returns the title the PDF stores, %s, beside the text", async (_, metadata) => {
    const answer = await paperTextOf(pdfOf(LINES, metadata), 150_000);

    expect(answer).toMatchObject({ ok: true, storedTitle: TITLE });
    expect(answer.ok && answer.paper.text).toContain(SENTENCE);
  });

  it.each([
    ["stores no title", {}],
    ["stores a blank one", { title: "  " }],
    ["holds metadata that does not parse", { xmp: "<x:xmpmeta><rdf:RDF><dc:title>" }],
  ])("still gives the text, with no stored title, for a PDF that %s", async (_, metadata) => {
    const answer = await paperTextOf(pdfOf(LINES, metadata), 150_000);

    expect(answer.ok).toBe(true);
    expect(answer).not.toHaveProperty("storedTitle");
    expect(answer.ok && answer.paper.text).toContain(SENTENCE);
  });

  it("is too-large for a file over maxBytes", async () => {
    const fetch = vi.fn(async () => new Response(PAPER_PDF as Uint8Array<ArrayBuffer>));
    const options = { gatewayUrl: "https://g.example", fetch, maxBytes: 100, timeoutMs: 60_000 };

    expect(await readPaperText(CID, { ...options, maxChars: 150_000 })).toEqual({
      ok: false,
      reason: "too-large",
    });
  });
});
