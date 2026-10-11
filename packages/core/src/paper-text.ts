/** A paper's text, as the phase-1 scorer reads it (ADR 0018). */
export interface PaperText {
  /** The PDF's pages joined and cleaned, then fitted to the cap. */
  readonly text: string;
  /** True when the reference list was left out or the end cut, to fit the cap. */
  readonly shortened: boolean;
}

/** The result of {@link preparePaperText}: `no-text` when the PDF holds almost no letters. */
export type PreparePaperResult =
  | { readonly ok: true; readonly paper: PaperText }
  | { readonly ok: false; readonly reason: "no-text" };

/** Fewer letters than this across the pages means a PDF of pictures, such as a scan. */
const MIN_LETTERS = 500;
/** A quote shorter than this, letters and digits only, shows nothing on its own. */
const MIN_QUOTE_CHARS = 10;
const REFERENCES_LEFT_OUT = "[References left out]";
const CUT = "\n[…]";
const NUMBER_ONLY = /^\d{1,5}$/;
const REFERENCES_HEADING =
  /^(?:references|reference list|bibliography|literature cited|works cited)$/i;
/** Headings that can follow a reference list: online methods, statements, appendices. */
const AFTER_REFERENCES =
  /^(?:(?:online |materials and )?methods|data (?:and code )?availability|code availability|acknowledge?ments?|author contributions|competing interests|conflicts? of interest|declarations?|funding|ethics|supplementary|supporting information|appendix)\b/i;

/**
 * A paper's text from its PDF's pages, as text extraction gives them: each line trimmed, lines
 * holding only a number (line and page numbers) dropped, a lowercase word hyphenated across a
 * line break joined, runs of spaces and of blank lines collapsed. A text over `maxChars` loses
 * its reference list first (from a "References" heading to the next statement or methods
 * heading, or to the end), then is cut at a word boundary and marked `[…]`; it never passes
 * `maxChars`. The same pages always give the same text.
 *
 * Returns `no-text` for pages holding fewer than 500 letters, such as a scanned PDF's.
 */
export function preparePaperText(pages: readonly string[], maxChars: number): PreparePaperResult {
  const text = pages
    .map((page) =>
      page
        .split("\n")
        .map((line) => line.replace(/[ \t ]+/g, " ").trim())
        .filter((line) => !NUMBER_ONLY.test(line))
        .join("\n"),
    )
    .join("\n\n")
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if ((text.match(/\p{L}/gu)?.length ?? 0) < MIN_LETTERS) return { ok: false, reason: "no-text" };
  if (text.length <= maxChars) return { ok: true, paper: { text, shortened: false } };

  const withoutReferences = leaveOutReferences(text);
  if (withoutReferences.length <= maxChars) {
    return { ok: true, paper: { text: withoutReferences, shortened: true } };
  }
  const room = withoutReferences.slice(0, maxChars - CUT.length + 1);
  const end = room.search(/\s\S*$/);
  const kept = room.slice(0, end > 0 ? end : maxChars - CUT.length).trimEnd();
  return { ok: true, paper: { text: `${kept}${CUT}`, shortened: true } };
}

/** The text with its last reference list replaced by a marker, or unchanged without one. */
function leaveOutReferences(text: string): string {
  const lines = text.split("\n");
  const start = lines.findLastIndex((line) => REFERENCES_HEADING.test(line));
  if (start < 0) return text;
  const after = lines.findIndex((line, index) => index > start && AFTER_REFERENCES.test(line));
  const end = after < 0 ? lines.length : after;
  return [...lines.slice(0, start), REFERENCES_LEFT_OUT, ...lines.slice(end)].join("\n");
}

/**
 * Text as a quote is matched against it: Unicode-normalized (NFKC, so a ligature reads as its
 * letters), lowercase, letters and digits only, so line breaks, hyphenation, dashes and quote
 * marks never decide a match. Normalize the paper's text once and pass it to {@link quoteFound}.
 */
export function normalizeForQuote(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * True when `quote` appears in the paper whose {@link normalizeForQuote normalized} text is
 * `normalizedText`, and holds at least 10 letters or digits: a quote the scorer made up, or
 * one too short to show anything, is not found.
 */
export function quoteFound(normalizedText: string, quote: string): boolean {
  const needle = normalizeForQuote(quote);
  return needle.length >= MIN_QUOTE_CHARS && normalizedText.includes(needle);
}
