/** The longest title a PDF's stored metadata may give a paper. */
const MAX_STORED_TITLE = 300;

/** A title as compared: whitespace collapsed, no final full stop, lowercase. */
function comparable(title: string): string {
  return title.replace(/\s+/g, " ").trim().replace(/\.$/, "").toLowerCase();
}

/**
 * A paper's title from GROBID's (`parseTeiHeader`) and the title the PDF stores in its own
 * metadata (its info dictionary's `Title` or its XMP `dc:title`), since GROBID's header model
 * can drop a title's first words (`docs/domain.md` → GROBID). Takes `stored`, its whitespace
 * collapsed, only when it is longer than GROBID's, at most 300 characters, and ends with
 * GROBID's title at a word's start, case, whitespace and a final full stop aside; otherwise
 * GROBID's, as is. So a file name, a journal's name or another paper's title stored there never
 * replaces it.
 */
export function completeTitle(grobid: string, stored: string | undefined): string {
  if (stored === undefined) return grobid;
  const whole = stored.replace(/\s+/g, " ").trim();
  const end = comparable(grobid);
  const candidate = comparable(whole);
  if (end === "" || whole.length > MAX_STORED_TITLE || candidate.length <= end.length) {
    return grobid;
  }
  const before = candidate.charAt(candidate.length - end.length - 1);
  return candidate.endsWith(end) && !/[\p{L}\p{N}]/u.test(before) ? whole : grobid;
}
