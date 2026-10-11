import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

/*
 * shadcn's table (registry `new-york-v4/table`, 2026-10-10), restyled with the app's tokens
 * (`app/globals.css`): hairline `line` borders, `muted` heads, a faint `surface` hover. Cells
 * wrap by default; a cell that must stay on one line says so. No hooks, so server and client
 * components can both use it.
 */

/** A table in a container that scrolls sideways itself, never the page. */
function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

/** The header row group; its rows take a hairline under them. */
function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-line", className)}
      {...props}
    />
  );
}

/** The body row group; its last row has no border. */
function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

/** The footer row group, on the faint surface. */
function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-line bg-surface font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

/** A row with a hairline under it and a faint hover. */
function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-line transition-colors hover:bg-surface data-[state=selected]:bg-surface-strong",
        className,
      )}
      {...props}
    />
  );
}

/** A header cell: small, muted, on one line. */
function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted",
        className,
      )}
      {...props}
    />
  );
}

/** A body cell, aligned to the top so wrapped cells line up. */
function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td data-slot="table-cell" className={cn("px-3 py-4 align-top", className)} {...props} />;
}

/** The table's caption, under it. */
function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted", className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
