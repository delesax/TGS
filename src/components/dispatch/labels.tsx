import Link from "next/link";
import { CircleHelp, CircleMinus, CirclePlus, ExternalLink } from "lucide-react";
import { POSITION_LABELS, type PositionChoice } from "@/lib/campaigns";
import { AI_USE_LABELS, KIND_LABELS, type AiUse, type Source } from "@/lib/dispatches";
import type { DispatchKind } from "@/lib/campaigns";
import { cn } from "@/lib/utils";

// Position is shown by word and shape, never colour alone: For is a plus,
// Against a minus, Undecided a question mark, and each has its own border style.
const POSITION_ICON = { for: CirclePlus, against: CircleMinus, undecided: CircleHelp } as const;
export const POSITION_BORDER: Record<PositionChoice, string> = {
  for: "border-l-[6px] border-l-primary",
  against: "border-l-[6px] [border-left-style:dashed] border-l-foreground",
  undecided: "border-l-[6px] [border-left-style:dotted] border-l-muted-foreground",
};

export function PositionTag({ position }: { position: PositionChoice | null }) {
  if (!position) return null;
  const Icon = POSITION_ICON[position];
  return (
    <span className="inline-flex items-center gap-1 rounded-full border-2 border-foreground px-2 py-0.5 text-base font-semibold">
      <Icon aria-hidden className="size-4" />
      {POSITION_LABELS[position]}
    </span>
  );
}

export function KindTag({ kind }: { kind: DispatchKind }) {
  return <span className="rounded-full bg-secondary px-2 py-0.5 text-base font-semibold text-secondary-foreground">{KIND_LABELS[kind].label}</span>;
}

export function AiUseLabel({ aiUse, className }: { aiUse: AiUse; className?: string }) {
  const { label, explain } = AI_USE_LABELS[aiUse];
  return (
    <p className={cn("text-base text-muted-foreground", className)}>
      <Link href="/ai-use" className="font-semibold text-foreground underline underline-offset-2">
        {label}
      </Link>
      <span className="sr-only">: </span>
      <span className="block sm:inline sm:before:content-['_·_']">{explain}</span>
    </p>
  );
}

export function SourceList({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-base font-semibold">Sources</p>
      <ul className="flex flex-col gap-1">
        {sources.map((s) => (
          <li key={s.url} className="min-w-0">
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="inline-flex min-h-12 max-w-full items-center gap-2 text-lg text-primary underline underline-offset-2 [overflow-wrap:anywhere]"
            >
              <ExternalLink aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0">
                {s.title ? `${s.title} ` : ""}
                <span className="font-semibold">({s.host})</span>
              </span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
