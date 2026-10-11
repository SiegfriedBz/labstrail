import { type PaperText, preparePaperText } from "@verisci/core";
import { extractText, getDocumentProxy } from "unpdf";
import { type FetchPdfOptions, fetchPdf } from "../publish/fetch-pdf.ts";

/**
 * The result of {@link readPaperText}: `unreachable` (the gateway did not give the file) is worth
 * a retry; `unreadable` (not a PDF, too large, a PDF that does not parse, or one with no text
 * layer) is final, since the same file always reads the same way.
 */
export type ReadPaperTextResult =
  | { readonly ok: true; readonly paper: PaperText }
  | { readonly ok: false; readonly reason: "unreachable" | "unreadable" };

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
  let pages: string[];
  try {
    const document = await getDocumentProxy(pdf.bytes);
    pages = (await extractText(document, { mergePages: false })).text;
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const prepared = preparePaperText(pages, options.maxChars);
  return prepared.ok ? prepared : { ok: false, reason: "unreadable" };
}
