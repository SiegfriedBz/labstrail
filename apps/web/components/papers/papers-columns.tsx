import { CheckCircle, Question, XCircle } from "@phosphor-icons/react/dist/ssr";
import { createColumnHelper, tableFeatures } from "@tanstack/react-table";
import type { PaperSummary, SignatureCheck } from "@verisci/workflows";
import Link from "next/link";
import { addressUrl } from "../../lib/papers/explorer.ts";
import { authorsLine, formatPublished, signatureLabel } from "../../lib/papers/papers.ts";
import { shorten } from "../../lib/shorten.ts";

/*
 * The papers table's columns. They depend on nothing at render time, so they live at module
 * scope: TanStack Table v9 rebuilds its models whenever `features` or `columns` change
 * identity, and a constant never does. Columns that need props or state (a sort, say) would
 * move into a `useMemo` instead.
 */

/** Core TanStack Table only: the server sorts and pages, so no row model is computed here. */
export const paperFeatures = tableFeatures({});

/** The column every width shows; below `md`, its cell also carries the others. */
export const PAPER_COLUMN = "title";

const column = createColumnHelper<typeof paperFeatures, PaperSummary>();

/** Paper (title and first authors), Published, Submitted by, Signature. */
export const paperColumns = column.columns([
  column.accessor(PAPER_COLUMN, {
    header: "Paper",
    cell: ({ row }) => <PaperCell paper={row.original} />,
  }),
  column.accessor("publishedAt", {
    header: "Published",
    cell: ({ getValue }) => <Published iso={getValue()} />,
  }),
  column.accessor("submitter", {
    header: "Submitted by",
    cell: ({ getValue }) => <Submitter address={getValue()} />,
  }),
  column.accessor("signatureCheck", {
    header: "Signature",
    cell: ({ getValue }) => <Signature check={getValue()} />,
  }),
]);

const CHECK = {
  valid: { icon: CheckCircle, tone: "text-accent" },
  invalid: { icon: XCircle, tone: "text-danger" },
  unknown: { icon: Question, tone: "text-muted" },
} as const;

/** The paper's title, linked to its page, its first authors, and below `md` the other columns. */
function PaperCell({ paper }: { paper: PaperSummary }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Link
        href={`/papers/${paper.cid}`}
        className="text-pretty font-medium leading-snug text-ink transition-colors hover:text-accent"
      >
        {paper.title}
      </Link>
      <p className="text-pretty text-xs leading-relaxed text-muted">{authorsLine(paper)}</p>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted md:hidden">
        <Published iso={paper.publishedAt} />
        <Submitter address={paper.submitter} />
        <Signature check={paper.signatureCheck} />
      </p>
    </div>
  );
}

function Published({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="text-muted">
      {formatPublished(iso)}
    </time>
  );
}

/** The submitter in short form, linked to the address on Basescan. */
function Submitter({ address }: { address: string }) {
  return (
    <a
      href={addressUrl(address)}
      target="_blank"
      rel="noreferrer"
      title={address}
      className="font-mono text-xs text-muted transition-colors hover:text-accent-2"
    >
      {shorten(address, 6, 4)}
    </a>
  );
}

function Signature({ check }: { check: SignatureCheck }) {
  const { icon: Icon, tone } = CHECK[check];
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`}>
      <Icon aria-hidden size={14} weight="bold" />
      {signatureLabel(check)}
    </span>
  );
}
