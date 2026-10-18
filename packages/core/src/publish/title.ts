/** The longest title a PDF's stored metadata may give a paper. */
const MAX_STORED_TITLE = 300;

/**
 * A journal's or a site's name stored before a title: a spaced dash or a bar anywhere in the
 * words before it ("Cell Genomics - "), or a dash ending them, an en or em dash spaced or not
 * ("Cell Genomics\u2014"). A colon, a full stop or a dash between two words belongs to a title's own
 * first words ("Neuroprotection: ", "E. coli", "Dose\u2013response").
 */
const NAME_SEPARATOR = /\s[-\u2013\u2014]\s|\||(?:\s-|[\u2013\u2014])\s*$/;

/** A title as compared: whitespace collapsed, no final full stop, lowercase. */
function comparable(title: string): string {
  return title.replace(/\s+/g, " ").trim().replace(/\.$/, "").toLowerCase();
}

/**
 * A paper's title from GROBID's (`parseTeiHeader`) and the title the PDF stores in its own
 * metadata (its info dictionary's `Title` or its XMP `dc:title`), since GROBID's header model
 * can drop a title's first words (`docs/domain.md` → GROBID). Takes `stored`, its whitespace
 * collapsed, only when it is longer than GROBID's, at most 300 characters, and ends with
 * GROBID's title at a word's start, case, whitespace and a final full stop aside, the words
 * before it being the ones GROBID dropped; otherwise GROBID's, as is. Words before it holding a
 * spaced dash or a bar, or ending in an en or em dash ("Cell Genomics - <title>",
 * "Cell Genomics—<title>"), are a journal's or a site's name, so they leave GROBID's too, cut
 * or whole, as does a file name, a journal's name or another paper's title stored on its own.
 */
export function completeTitle(grobid: string, stored: string | undefined): string {
  if (stored === undefined) return grobid;
  const whole = stored.replace(/\s+/g, " ").trim();
  const end = comparable(grobid);
  const candidate = comparable(whole);
  if (end === "" || whole.length > MAX_STORED_TITLE || candidate.length <= end.length) {
    return grobid;
  }
  const dropped = candidate.slice(0, candidate.length - end.length);
  const atWord = !/[\p{L}\p{N}]/u.test(dropped.charAt(dropped.length - 1));
  return candidate.endsWith(end) && atWord && !NAME_SEPARATOR.test(dropped) ? whole : grobid;
}
