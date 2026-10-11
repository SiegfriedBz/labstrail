import { parseUal } from "./ual.ts";

/** A full context graph id whose name an IRI and a string literal can both hold. */
const GRAPH_ID = /^0x[0-9a-fA-F]{40}\/[^/\s<>"{}|^`\\]+$/;

/**
 * A context graph's IRI, `did:dkg:context-graph:<id>`, for a full id (`<agent address>/<name>`)
 * whose name holds none of `<>"{}|^` `` ` `` `\`, or `undefined`. The id keeps its spelling:
 * the node reads a graph only in the case it lists it in (`docs/domain.md` → DKG).
 */
export function contextGraphIri(contextGraph: string): string | undefined {
  return GRAPH_ID.test(contextGraph) ? `did:dkg:context-graph:${contextGraph}` : undefined;
}

/**
 * The graph holding a minted asset's triples,
 * `<context graph IRI>/_verifiable_memory/<UAL address>/<UAL number>`, or `undefined` when
 * the graph id or the UAL is malformed. Reading an asset there, rather than across graphs,
 * keeps another asset's triples about the same subject out (`docs/domain.md` → DKG).
 */
export function assetGraphIri(contextGraph: string, ual: string): string | undefined {
  const graph = contextGraphIri(contextGraph);
  const parsed = parseUal(ual);
  return graph && parsed.ok
    ? `${graph}/_verifiable_memory/${parsed.ual.address}/${parsed.ual.id}`
    : undefined;
}
