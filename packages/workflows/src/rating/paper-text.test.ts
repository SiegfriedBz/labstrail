import { describe, expect, it, vi } from "vitest";
import { readPaperText } from "./paper-text.ts";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const SENTENCE = "Patients were randomly assigned to citicoline or placebo in a one to one ratio.";

/** A one-page PDF showing each line in Helvetica, with valid cross-reference offsets. */
function pdfOf(lines: readonly string[]): Uint8Array {
  const shown = lines.map((line) => `(${line}) Tj 0 -14 Td`).join(" ");
  const content = `BT /F1 10 Tf 40 760 Td ${shown} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

const PAPER_PDF = pdfOf(Array.from({ length: 12 }, () => SENTENCE));

function read(body: Uint8Array | string, status = 200, maxChars = 150_000) {
  const fetch = vi.fn(
    async () =>
      new Response(typeof body === "string" ? body : (body as Uint8Array<ArrayBuffer>), { status }),
  );
  const options = {
    gatewayUrl: "https://verisci.mypinata.cloud/",
    fetch,
    maxBytes: 30 * 1024 * 1024,
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
      `https://verisci.mypinata.cloud/ipfs/${CID}`,
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
    expect(await read("busy", 503).result).toEqual({ ok: false, reason: "unreachable" });
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

  it("is unreadable for a file over maxBytes", async () => {
    const fetch = vi.fn(async () => new Response(PAPER_PDF as Uint8Array<ArrayBuffer>));
    const options = { gatewayUrl: "https://g.example", fetch, maxBytes: 100, timeoutMs: 60_000 };

    expect(await readPaperText(CID, { ...options, maxChars: 150_000 })).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });
});
