import { type PaperText, preparePaperText } from "@verisci/core";
import { extractText, getDocumentProxy } from "unpdf";
import { type FetchPdfOptions, fetchPdf } from "./fetch-pdf.ts";

/**
 * The result of {@link readPaperText}. `no-text` (a PDF with almost no letters, such as a scan)
 * and `too-large` (over `maxBytes`, such as a paper published under an earlier, higher limit)
 * are the paper's own. `unreachable` (the gateway did not give the file) is worth a retry, and
 * so is `unreadable` (not a PDF, or a PDF the reader does not parse) a few times: the gateway
 * may have given another file.
 */
export type ReadPaperTextResult =
  | {
      readonly ok: true;
      readonly paper: PaperText;
      /**
       * The title the PDF stores in its own metadata, when it holds one: its info dictionary's
       * `Title`, else its XMP `dc:title`. The publish run completes GROBID's title with it
       * (`completeTitle`); the rating run reads only `paper`.
       */
      readonly storedTitle?: string;
    }
  | { readonly ok: false; readonly reason: "too-large" | "unreadable" | "no-text" }
  | {
      readonly ok: false;
      readonly reason: "unreachable";
      /** Why the gateway did not give the file (`fetchPdf`). */
      readonly detail: string;
    };

/** Where {@link readPaperText} reads a PDF, and how much of its text it keeps. */
export interface ReadPaperTextOptions extends FetchPdfOptions {
  /** The longest text kept (`preparePaperText`). */
  readonly maxChars: number;
}

/**
 * Reads a published paper's text for the scorer (ADR 0018): fetches its PDF by CID through
 * the gateway, extracts each page's text with unpdf, and prepares it with `preparePaperText`,
 * so the PDF's bytes stay inside this function and the step that calls it (ADR 0010).
 * Never throws.
 */
export async function readPaperText(
  cid: string,
  options: ReadPaperTextOptions,
): Promise<ReadPaperTextResult> {
  const pdf = await fetchPdf(cid, options);
  if (!pdf.ok) {
    if (pdf.reason === "unreachable") return pdf;
    return { ok: false, reason: pdf.reason === "not-a-pdf" ? "unreadable" : pdf.reason };
  }
  return paperTextOf(pdf.bytes, options.maxChars);
}

/**
 * A PDF's text for the scorer, and its opening for the publish run's field check: each
 * page's text extracted with unpdf, then prepared with `preparePaperText` and fitted to
 * `maxChars`, with the title the PDF stores (`storedTitle`) when it holds one. `unreadable`
 * for a PDF that does not parse, `no-text` for one with no text layer; metadata that does not
 * parse only leaves out the stored title. Never throws.
 */
export async function paperTextOf(
  bytes: Uint8Array,
  maxChars: number,
): Promise<ReadPaperTextResult> {
  let pages: string[];
  let storedTitle: string | undefined;
  try {
    const document = await getDocumentProxy(bytes);
    storedTitle = await storedTitleOf(document);
    pages = (await extractText(document, { mergePages: false })).text;
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const prepared = preparePaperText(pages, maxChars);
  if (!prepared.ok) return { ok: false, reason: "no-text" };
  return storedTitle === undefined ? prepared : { ...prepared, storedTitle };
}

/**
 * The title `document` stores: its info dictionary's `Title`, else its XMP `dc:title`, or
 * `undefined` when it holds neither, a blank one, or metadata that does not parse.
 */
async function storedTitleOf(
  document: Awaited<ReturnType<typeof getDocumentProxy>>,
): Promise<string | undefined> {
  try {
    const { info, metadata } = await document.getMetadata();
    const titles = [(info as { Title?: unknown }).Title, metadata?.get("dc:title")];
    return titles.find(
      (title): title is string => typeof title === "string" && title.trim() !== "",
    );
  } catch {
    return undefined;
  }
}
