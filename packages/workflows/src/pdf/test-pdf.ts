/** What a test PDF stores about itself: its info dictionary's `Title`, and an XMP packet. */
export interface TestPdfMetadata {
  readonly title?: string;
  /** The XMP stream's text, as is (`xmpOf` builds one with a `dc:title`). */
  readonly xmp?: string;
}

/**
 * A one-page PDF showing each line in Helvetica, with valid cross-reference offsets, for tests
 * that read a PDF's text with unpdf, and with `metadata` when given.
 */
export function pdfOf(lines: readonly string[], metadata: TestPdfMetadata = {}): Uint8Array {
  const shown = lines.map((line) => `(${line}) Tj 0 -14 Td`).join(" ");
  const content = `BT /F1 10 Tf 40 760 Td ${shown} ET`;
  const xmp = metadata.xmp === undefined ? "" : " /Metadata 7 0 R";
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R${xmp} >>`,
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    metadata.title === undefined ? "<< >>" : `<< /Title (${metadata.title}) >>`,
    `<< /Type /Metadata /Subtype /XML /Length ${metadata.xmp?.length ?? 0} >>\nstream\n${metadata.xmp ?? ""}\nendstream`,
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
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

/** An XMP packet holding `title` as its `dc:title`, as publishers write it. */
export function xmpOf(title: string): string {
  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${title}</rdf:li>
        </rdf:Alt>
      </dc:title>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}
