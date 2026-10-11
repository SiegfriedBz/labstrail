import { type PaperText, preparePaperText } from "@verisci/core";
import { extractText, getDocumentProxy } from "unpdf";
import { type FetchPdfOptions, fetchPdf } from "../publish/fetch-pdf.ts";

/**
 * The result of {@link readPaperText}. `no-text` (a PDF with almost no letters, such as a scan)
 * is the paper's own. `unreachable` (the gateway did not give the file) and `unreadable` (not a
 * PDF, too large, or a PDF the reader does not parse) are worth a retry: the publish run read
 * the same file, so these point at the gateway or the reader.
 */
export type ReadPaperTextResult =
  | { readonly ok: true; readonly paper: PaperText }
  | { readonly ok: false; readonly reason: "unreachable" | "unreadable" | "no-text" };

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
    return { ok: false, reason: pdf.reason === "unreachable" ? "unreachable" : "unreadable" };
  }
  return paperTextOf(pdf.bytes, options.maxChars);
}

/**
 * A PDF's text for the scorer: each page's text extracted with unpdf, then prepared with
 * `preparePaperText` and fitted to `maxChars`. `unreadable` for a PDF that does not parse,
 * `no-text` for one with no text layer. Never throws.
 */
export async function paperTextOf(
  bytes: Uint8Array,
  maxChars: number,
): Promise<ReadPaperTextResult> {
  let pages: string[];
  try {
    const document = await getDocumentProxy(bytes);
    pages = (await extractText(document, { mergePages: false })).text;
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const prepared = preparePaperText(pages, maxChars);
  return prepared.ok ? prepared : { ok: false, reason: "no-text" };
}
