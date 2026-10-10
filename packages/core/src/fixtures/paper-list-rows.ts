/**
 * Rows the local DKG node (10.0.22) answered for the papers list's queries on
 * `verisci-staging`, saved 2026-10-10: the first page of two, the count, and that page's
 * authors (the second paper has none).
 */
export const pageRows = [
  {
    paper: "urn:verisci:paper:bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m",
    ual: "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/9",
    publishedAt: '"2026-10-10T15:14:13.222Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>',
    title:
      '"TEAD4 Regulates apical domain homeostasis and cell-positioning to maintain the trophectoderm lineage during mouse blastocyst development"',
    submitter: '"0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111"',
    signature:
      '"0x1c32cbcbb8d2191482787a7e7702cece190cc324d4324fb07a759eb9028cc75c11159b921fd1a52553d59f9ce3f9f7d768a7fd014739e81c04c93d15fd01e0a81c"',
    deadline: '"1791645808"^^<http://www.w3.org/2001/XMLSchema#integer>',
  },
  {
    paper: "urn:verisci:paper:bafybeihhkeyxcad3cuj42gvhpsh67tiagkwfxbjgjsx7m3tidbkknkifcy",
    ual: "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/8",
    publishedAt: '"2026-10-10T14:30:29.135Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>',
    title:
      '"Cross-kingdom RNA interference as a unifying mechanism in plant-microbe interactions From virulence to mutualism: ckRNAi is a conserved communication strategy"',
    submitter: '"0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111"',
    signature:
      '"0x02ad1008663053580be18e43d38490bfdb901c0887f3da4377d17d6021b3156e54c3fc5d1c8aae98a1e05b36227813874b644cadb5b16b3dcc8fb7f0c50900ab1b"',
    deadline: '"1791643203"^^<http://www.w3.org/2001/XMLSchema#integer>',
  },
] as const;

export const countRows = [{ total: '"5"^^<http://www.w3.org/2001/XMLSchema#integer>' }] as const;

export const authorRows = [
  {
    paper: "urn:verisci:paper:bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m",
    authorName: '"Alexander W Bruce"',
    authorPosition: '"1"^^<http://www.w3.org/2001/XMLSchema#integer>',
    authorCount: '"10"^^<http://www.w3.org/2001/XMLSchema#integer>',
  },
  {
    paper: "urn:verisci:paper:bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m",
    authorName: '"Rebecca Collier"',
    authorPosition: '"2"^^<http://www.w3.org/2001/XMLSchema#integer>',
    authorCount: '"10"^^<http://www.w3.org/2001/XMLSchema#integer>',
  },
  {
    paper: "urn:verisci:paper:bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m",
    authorName: '"Martina Bohuslavová"',
    authorPosition: '"3"^^<http://www.w3.org/2001/XMLSchema#integer>',
    authorCount: '"10"^^<http://www.w3.org/2001/XMLSchema#integer>',
  },
] as const;
