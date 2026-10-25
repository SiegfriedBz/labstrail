/** The longest title a PDF's stored metadata may give a paper. */
const MAX_STORED_TITLE = 300;

/**
 * A journal's or a site's name stored before a title: a spaced dash or a bar anywhere in the
 * words before it ("Cell Genomics - "), or a dash ending them, an en or em dash spaced or not
 * ("Cell Genomics\u2014"). A colon, a full stop or a dash between two words belongs to a title's own
 * first words ("Neuroprotection: ", "E. coli", "Dose\u2013response").
 */
const NAME_SEPARATOR = /\s[-\u2013\u2014]\s|\||(?:\s-|[\u2013\u2014])\s*$/;

/** A hyphen or a dash starting a title: GROBID's header model cuts a title at one. */
const LEADING_DASH = /^\s*[-\u2013\u2014]\s*/;

/**
 * A title as compared: no whitespace at all, lowercase, no final full stop. `at` gives, for each
 * of its characters, its index in `title`, so a match maps back to the title's own text.
 */
function comparable(title: string): { readonly text: string; readonly at: readonly number[] } {
  let text = "";
  const at: number[] = [];
  for (const { 0: char, index } of title.matchAll(/\S/gu)) {
    const lower = char.toLowerCase();
    text += lower;
    for (let unit = 0; unit < lower.length; unit++) at.push(index);
  }
  return text.endsWith(".") ? { text: text.slice(0, -1), at: at.slice(0, -1) } : { text, at };
}

/**
 * A paper's title from GROBID's (`parseTeiHeader`) and the title the PDF stores in its own
 * metadata (its info dictionary's `Title` or its XMP `dc:title`), since GROBID's header model
 * can drop a title's first words and space a title differently (`docs/domain.md` → GROBID).
 * Takes `stored`, its whitespace collapsed, only when it is longer than GROBID's, at most 300
 * characters, and ends with GROBID's title at a word's start, or where GROBID's starts with a
 * hyphen or a dash, at which GROBID cut it ("CDK1-Cyclin B …" for "-Cyclin B …"). The two
 * compare with case, every whitespace and a final full stop aside, the words before the match
 * being the ones GROBID dropped. Those words, read with the stored title's own spacing, are a
 * journal's or a site's name when they hold a spaced dash or a bar, or end in an en or em dash
 * ("Cell Genomics - <title>", "Cell Genomics—<title>"), so they leave GROBID's too, cut or
 * whole, as does a file name, a journal's name or another paper's title stored on its own.
 * GROBID's title is returned without a leading hyphen or dash.
 */
export function completeTitle(grobid: string, stored: string | undefined): string {
  const kept = grobid.replace(LEADING_DASH, "") || grobid;
  if (stored === undefined) return kept;
  const whole = stored.replace(/\s+/g, " ").trim();
  const end = comparable(grobid).text;
  const candidate = comparable(whole);
  if (
    end === "" ||
    whole.length > MAX_STORED_TITLE ||
    candidate.text.length <= end.length ||
    !candidate.text.endsWith(end)
  ) {
    return kept;
  }
  const dropped = whole.slice(0, candidate.at[candidate.text.length - end.length]);
  const atWord =
    LEADING_DASH.test(grobid) || !/[\p{L}\p{N}]/u.test(dropped.charAt(dropped.length - 1));
  return atWord && !NAME_SEPARATOR.test(dropped) ? whole : kept;
}
