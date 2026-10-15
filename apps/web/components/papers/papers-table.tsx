"use client";

import { useTable } from "@tanstack/react-table";
import type { PaperRow } from "../../lib/papers/ratings.ts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table.tsx";
import { PAPER_COLUMN, paperColumns, paperFeatures } from "./papers-columns.tsx";

/** Columns past the paper's own show from `md`; below it, the paper's cell carries them. */
const WIDE_ONLY = "hidden md:table-cell";

/**
 * Published papers as rows, in the order given: the server has already sorted and paged
 * them (`listPapers`). Below `md`, each row is one stacked cell, so the page never scrolls
 * sideways. The columns are in `papers-columns.tsx`.
 */
export function PapersTable({
  papers,
  label = "Published papers, newest first",
}: {
  papers: readonly PaperRow[];
  /** What the table lists, for screen readers. */
  label?: string;
}) {
  const table = useTable({
    features: paperFeatures,
    columns: paperColumns,
    data: papers as PaperRow[],
    getRowId: (paper) => paper.cid,
  });

  return (
    <Table aria-label={label}>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id} className="hover:bg-transparent">
            {group.headers.map((header) => (
              <TableHead
                key={header.id}
                className={header.column.id === PAPER_COLUMN ? undefined : WIDE_ONLY}
              >
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell
                key={cell.id}
                className={
                  cell.column.id === PAPER_COLUMN ? undefined : `${WIDE_ONLY} whitespace-nowrap`
                }
              >
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
