import { describe, expect, it } from "vitest";
import { pdfOf } from "../pdf/test-pdf.ts";
import { readPaper } from "./read-paper.ts";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const SENTENCE = "Patients were randomly assigned to citicoline or placebo in a one to one ratio.";
const LINES = Array.from({ length: 12 }, () => SENTENCE);
const PDF = pdfOf(LINES);
const TEI = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc>
  <titleStmt><title>A Title</title></titleStmt></fileDesc></teiHeader></TEI>`;

/** Answers the gateway with `pdf` and GROBID with `grobid`, by URL, keeping what GROBID got. */
function fakeFetch(pdf: () => Response, grobid: () => Response) {
  const sent: FormData[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes("/ipfs/")) return pdf();
    sent.push(init?.body as FormData);
    return grobid();
  }) as typeof globalThis.fetch;
  return { fetch, sent };
}

function read(fetch: typeof globalThis.fetch, openingChars = 6_000) {
  return readPaper(CID, {
    gatewayUrl: "https://example.mypinata.cloud",
    grobidUrl: "http://127.0.0.1:8070",
    fetch,
    maxBytes: 100_000,
    timeoutMs: 1000,
    openingChars,
  });
}

function pdfResponse(bytes: Uint8Array = PDF): Response {
  return new Response(bytes.slice() as Uint8Array<ArrayBuffer>);
}

describe("readPaper", () => {
  it("fetches the PDF, parses its header and returns its metadata and its text's opening", async () => {
    const { fetch } = fakeFetch(pdfResponse, () => new Response(TEI));
    const result = await read(fetch);

    expect(result).toMatchObject({ ok: true, metadata: { title: "A Title", authors: [] } });
    expect(result.ok && result.opening).toContain(SENTENCE);
  });

  it("completes the title GROBID cut from the title the PDF stores, keeping the rest GROBID's", async () => {
    const cut = "by RNA sequence, structure, and cell-type-specific features";
    const full = `PUS7 mRNA pseudouridylation is driven ${cut}`;
    const header = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc>
      <titleStmt><title>${cut}</title></titleStmt>
      <sourceDesc><biblStruct><analytic>
        <author><persName><forename>Rebecca</forename><surname>Rodell</surname></persName></author>
        <idno type="DOI">10.1016/j.xgen.2026.101332</idno>
      </analytic></biblStruct></sourceDesc></fileDesc>
      <profileDesc><abstract><p>Pseudouridine is a common mRNA modification.</p></abstract></profileDesc>
    </teiHeader></TEI>`;
    const { fetch } = fakeFetch(
      () => pdfResponse(pdfOf(LINES, { title: full })),
      () => new Response(header),
    );

    expect(await read(fetch)).toMatchObject({
      ok: true,
      metadata: {
        title: full,
        authors: ["Rebecca Rodell"],
        abstract: "Pseudouridine is a common mRNA modification.",
        doi: "10.1016/j.xgen.2026.101332",
      },
    });
  });

  it("keeps the first openingChars characters of the text as the rating prepares it", async () => {
    const { fetch } = fakeFetch(pdfResponse, () => new Response(TEI));
    const result = await read(fetch, 200);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.opening.length).toBeLessThanOrEqual(200);
    expect(result.opening.startsWith(SENTENCE)).toBe(true);
  });

  it("sends GROBID the whole PDF, though the text reader takes its copy over", async () => {
    const { fetch, sent } = fakeFetch(pdfResponse, () => new Response(TEI));

    expect((await read(fetch)).ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect((sent[0] as FormData).get("input")).toHaveProperty("size", PDF.length);
  });

  it("passes on why the PDF could not be fetched", async () => {
    const { fetch } = fakeFetch(
      () => new Response("<html/>"),
      () => new Response(TEI),
    );

    expect(await read(fetch)).toEqual({ ok: false, reason: "not-a-pdf" });
  });

  it("passes on why GROBID could not parse it", async () => {
    const { fetch } = fakeFetch(pdfResponse, () => new Response("busy", { status: 503 }));

    expect(await read(fetch)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reports a header with no title as no-title", async () => {
    const { fetch } = fakeFetch(pdfResponse, () => new Response(TEI.replace("A Title", "")));

    expect(await read(fetch)).toEqual({ ok: false, reason: "no-title" });
  });

  it("reports an answer that is not TEI as unparseable", async () => {
    const { fetch } = fakeFetch(pdfResponse, () => new Response("<html/>"));

    expect(await read(fetch)).toEqual({ ok: false, reason: "unparseable" });
  });

  it("refuses a PDF whose header GROBID read but the rating's reader cannot parse", async () => {
    const broken = new TextEncoder().encode("%PDF-1.4\nthis is not a PDF body");
    const { fetch } = fakeFetch(
      () => pdfResponse(broken),
      () => new Response(TEI),
    );

    expect(await read(fetch)).toEqual({ ok: false, reason: "unreadable" });
  });

  it("refuses a PDF with no text layer, such as a scan", async () => {
    const { fetch } = fakeFetch(
      () => pdfResponse(pdfOf([])),
      () => new Response(TEI),
    );

    expect(await read(fetch)).toEqual({ ok: false, reason: "no-text" });
  });
});
