import Link from "next/link";
import { legalHas, legalValue, type LegalKey } from "@/lib/legal";
import { cn } from "@/lib/utils";

/**
 * A legal fact from src/lib/legal.ts. When the owner has not supplied it, it
 * shows "[to be added]" in a highlighted box (and carries data-pending so the
 * gate test can find it).
 */
export function Fact({ k }: { k: LegalKey }) {
  if (legalHas(k)) return <>{legalValue(k)}</>;
  return (
    <span data-pending="fact" className="rounded bg-accent px-1 font-semibold text-accent-foreground">
      {legalValue(k)}
    </span>
  );
}

/** An email address from LEGAL as a mailto link, or the placeholder. */
export function FactEmail({ k }: { k: "privacyEmail" | "contactEmail" }) {
  if (!legalHas(k)) return <Fact k={k} />;
  return (
    <a href={`mailto:${legalValue(k)}`} className="font-semibold text-primary underline">
      {legalValue(k)}
    </a>
  );
}

/**
 * A fact only the owner can supply or confirm, shown in square brackets
 * (for example "[six years]"). Listed in docs/LEGAL_WORDING.md.
 */
export function Pending({ children }: { children: React.ReactNode }) {
  return (
    <span data-pending="owner" className="rounded bg-accent px-1 font-semibold text-accent-foreground">
      [{children}]
    </span>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-4 text-2xl font-semibold">{children}</h2>;
}

export function Prose({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4 text-lg leading-relaxed">{children}</div>;
}

/**
 * A table that stacks on a phone: each row becomes a small card whose cells
 * show their column name above them. No horizontal scroll at 375px.
 */
export function StackTable({ columns, rows, caption }: { columns: string[]; rows: React.ReactNode[][]; caption?: string }) {
  return (
    <table className="w-full border-collapse text-lg">
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      <thead className="sr-only sm:not-sr-only">
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col" className="border-b-2 border-border px-3 py-2 text-left font-semibold">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="block sm:table-row-group">
        {rows.map((row, i) => (
          <tr key={i} className="mb-4 block rounded-lg border border-border sm:mb-0 sm:table-row sm:rounded-none sm:border-0">
            {row.map((cell, j) => (
              <td key={j} className={cn("block px-3 py-2 sm:table-cell sm:border-b sm:border-border sm:align-top", j === 0 && "font-semibold")}>
                <span className="block text-base font-semibold text-muted-foreground sm:hidden">{columns[j]}</span>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InlineLink({ href, children, newTab }: { href: string; children: React.ReactNode; newTab?: boolean }) {
  return (
    <Link href={href} {...(newTab ? { target: "_blank" } : {})} className="font-semibold text-primary underline">
      {children}
    </Link>
  );
}
