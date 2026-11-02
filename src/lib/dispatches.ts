import type { DispatchKind, PositionChoice } from "@/lib/campaigns";

// Dispatch model, labels, source-link sanitising, threading and error wording.
// Pure functions only. The database (post_dispatch() and its trigger) enforces
// the same rules again; these give people a clear message before they post.

export const AI_USES = ["none", "assisted", "generated"] as const;
export type AiUse = (typeof AI_USES)[number];

/** Shown on every Dispatch (CLAUDE.md rule 9). Plain words are the explanation. */
export const AI_USE_LABELS: Record<AiUse, { label: string; explain: string; choice: string }> = {
  none: { label: "Written without AI", explain: "The author says no AI tool helped write this.", choice: "None. I wrote this myself." },
  assisted: {
    label: "Written with AI help",
    explain: "The author used AI to check, edit or research, but the argument is theirs.",
    choice: "Assisted. AI helped me check, edit or research, but the argument is mine.",
  },
  generated: { label: "Mostly written by AI", explain: "The author says most of this text came from an AI tool.", choice: "Generated. Most of this text was written by AI." },
};

export const KIND_LABELS: Record<DispatchKind, { label: string; explain: string }> = {
  argument: { label: "Argument", explain: "Make your case. No links: post sources as evidence." },
  rebuttal: { label: "Rebuttal", explain: "Answer another Dispatch. You may add sources." },
  evidence: { label: "Evidence", explain: "Share at least one source, with a short note on why it matters." },
};

export const MAX_SOURCES = 5;

export type DispatchLimits = {
  argument_max_chars: number;
  rebuttal_max_chars: number;
  evidence_max_chars: number;
  max_dispatches_per_round: number;
  cooldown_seconds: number;
  edit_window_seconds: number;
};

/** The recommended defaults, used only if the settings row cannot be read. */
export const DEFAULT_LIMITS: DispatchLimits = {
  argument_max_chars: 1500,
  rebuttal_max_chars: 1000,
  evidence_max_chars: 600,
  max_dispatches_per_round: 10,
  cooldown_seconds: 30,
  edit_window_seconds: 300,
};

export function maxCharsFor(kind: DispatchKind, limits: DispatchLimits): number {
  return kind === "argument" ? limits.argument_max_chars : kind === "rebuttal" ? limits.rebuttal_max_chars : limits.evidence_max_chars;
}

// ---------------------------------------------------------------------------
// Source links
// ---------------------------------------------------------------------------

export type Source = { url: string; host: string; title?: string };

// Query parameters that only track clicks. Removed from every link.
const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "dclid", "gbraid", "wbraid", "msclkid", "yclid", "twclid", "ttclid", "li_fat_id",
  "mc_cid", "mc_eid", "igshid", "igsh", "_ga", "_gl", "_hsenc", "_hsmi", "mkt_tok", "ref_src", "ref_url", "si", "spm", "s_cid",
]);

function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase();
  return key.startsWith("utm_") || key.startsWith("pk_") || TRACKING_PARAMS.has(key);
}

export type SanitisedLink = { ok: true; url: string; host: string } | { ok: false; error: string };

/**
 * Accepts http and https links only (adding https:// when none is typed),
 * removes tracking parameters, and returns the URL with its normalised host.
 */
export function sanitiseSourceUrl(raw: string): SanitisedLink {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Enter a web address." };
  if (input.length > 2048) return { ok: false, error: "That web address is too long." };
  if (/\s/.test(input)) return { ok: false, error: "A web address cannot contain spaces." };

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(input);
  if (hasScheme && !/^https?:\/\//i.test(input)) {
    return { ok: false, error: "Only web links starting with http:// or https:// are allowed." };
  }
  let url: URL;
  try {
    url = new URL(hasScheme ? input : `https://${input}`);
  } catch {
    return { ok: false, error: "That does not look like a web address. Copy it from your browser's address bar." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only web links starting with http:// or https:// are allowed." };
  }
  if (url.username || url.password) return { ok: false, error: "Links with a username or password are not allowed." };
  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!host.includes(".") || host.length > 255) {
    return { ok: false, error: "That does not look like a public web address." };
  }

  for (const name of [...url.searchParams.keys()]) {
    if (isTrackingParam(name)) url.searchParams.delete(name);
  }
  const clean = url.toString();
  if (clean.length > 2048) return { ok: false, error: "That web address is too long." };
  return { ok: true, url: clean, host };
}

export type SourceInput = { url: string; title: string };
export type SourcesResult = { sources: Source[]; errors: Record<string, string> };

/** Validates up to MAX_SOURCES link rows. Blank rows are ignored; duplicates are dropped. */
export function parseSources(rows: SourceInput[]): SourcesResult {
  const sources: Source[] = [];
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    if (!row.url.trim() && !row.title.trim()) return;
    const key = `source${i + 1}`;
    const link = sanitiseSourceUrl(row.url);
    if (!link.ok) {
      errors[key] = link.error;
      return;
    }
    const title = row.title.trim();
    if (title.length > 200) {
      errors[key] = "Keep the link title to 200 characters or fewer.";
      return;
    }
    if (seen.has(link.url)) return;
    seen.add(link.url);
    sources.push(title ? { url: link.url, host: link.host, title } : { url: link.url, host: link.host });
  });
  if (sources.length > MAX_SOURCES) errors.sources = `Add at most ${MAX_SOURCES} links.`;
  return { sources, errors };
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export type DispatchRow = {
  id: string;
  campaign_id: string;
  author_id: string;
  parent_id: string | null;
  display_parent_id: string | null;
  root_id: string;
  depth: number;
  kind: DispatchKind;
  position: PositionChoice | null;
  body: string;
  sources: Source[];
  ai_use: AiUse;
  round_position: number | null;
  reaction_counts: Record<string, number>;
  created_at: string;
  edited_at: string | null;
  withdrawn_at: string | null;
  hidden_at: string | null;
  author: { handle: string | null } | null;
};

export type ThreadNode = DispatchRow & {
  children: ThreadNode[];
  /** Set when the reply sits flat under a deeper Dispatch it does not answer directly. */
  replyingTo: { id: string; handle: string | null } | null;
};

/**
 * Builds threads from a flat list: roots newest first, replies oldest first
 * under the Dispatch they are shown beneath (display_parent_id). Replies whose
 * display parent is missing from the list are dropped rather than misplaced.
 */
export function buildThreads(rows: DispatchRow[]): ThreadNode[] {
  const byId = new Map<string, ThreadNode>();
  for (const row of rows) byId.set(row.id, { ...row, children: [], replyingTo: null });

  const roots: ThreadNode[] = [];
  for (const node of byId.values()) {
    if (!node.display_parent_id) {
      if (node.depth === 0) roots.push(node);
      continue;
    }
    const parent = byId.get(node.display_parent_id);
    if (!parent) continue;
    if (node.parent_id && node.parent_id !== node.display_parent_id) {
      const target = byId.get(node.parent_id);
      node.replyingTo = { id: node.parent_id, handle: target?.author?.handle ?? null };
    }
    parent.children.push(node);
  }
  const oldestFirst = (a: ThreadNode, b: ThreadNode) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id);
  for (const node of byId.values()) node.children.sort(oldestFirst);
  return roots.sort((a, b) => -oldestFirst(a, b));
}

/** Number of replies under a node, at any depth. */
export function countReplies(node: ThreadNode): number {
  return node.children.reduce((n, child) => n + 1 + countReplies(child), 0);
}

// ---------------------------------------------------------------------------
// Database errors -> plain English
// ---------------------------------------------------------------------------

export type DispatchProblem = {
  code: string;
  message: string;
  hint?: string;
  /** For COOLDOWN: seconds to wait. */
  waitSeconds?: number;
  field?: string;
};

export function describeDispatchError(error: { message?: string; details?: string | null } | null | undefined): DispatchProblem {
  const message = error?.message ?? "";
  const code = /^([A-Z_]+):/.exec(message)?.[1] ?? "UNKNOWN";
  const detail = Number(error?.details);
  switch (code) {
    case "NOT_SIGNED_IN":
      return { code, message: "Please sign in to post.", hint: "Sign in, then come back to this Campaign." };
    case "NOT_ONBOARDED":
      return { code, message: "Choose your handle first.", hint: "Every Dispatch is posted under your handle." };
    case "CAMPAIGN_NOT_OPEN":
      return { code, message: "This Campaign has not opened yet.", hint: "Dispatches open when the countdown reaches zero." };
    case "CAMPAIGN_CLOSED":
      return { code, message: "This Campaign has closed.", hint: "Dispatches, edits and reactions stop at the deadline. Your draft is still in the box if you want to copy it." };
    case "CAMPAIGN_NOT_FOUND":
      return { code, message: "We could not find this Campaign.", hint: "Go back to Campaigns and open it again." };
    case "NO_ROUND_NOW":
      return { code, message: "No round is running at the moment.", hint: "The next round opens soon. Check the round deadlines on this page." };
    case "KIND_NOT_IN_ROUND":
      return { code, message: "This round does not accept that kind of Dispatch.", hint: "Check which kinds this round accepts, shown above the box.", field: "kind" };
    case "AI_USE_REQUIRED":
      return { code, message: "Say whether you used AI.", hint: "Choose one of the three options.", field: "aiUse" };
    case "BODY_REQUIRED":
      return { code, message: "Write your Dispatch before posting.", field: "body" };
    case "BODY_TOO_LONG":
      return { code, message: `Your Dispatch is too long${detail ? `: keep it to ${detail.toLocaleString("en-GB")} characters` : ""}.`, field: "body" };
    case "POSITION_REQUIRED":
      return { code, message: "Record your position first.", hint: "Use the Your position box on this page, then post." };
    case "POSITION_SIDE_REQUIRED":
      return { code, message: "Choose For or Against to post here.", hint: "This is an Oxford-style Campaign, so each Dispatch argues one side. Change your position above." };
    case "ROUND_LIMIT":
      return {
        code,
        message: `You have reached the limit of ${detail || 10} Dispatches in this round.`,
        hint: "You can still react to other Dispatches. The limit resets when the next round starts.",
      };
    case "COOLDOWN":
      return { code, message: `Please wait ${detail || "a few"} seconds before posting again.`, hint: "A short pause between posts keeps the debate readable. Your text is kept.", waitSeconds: detail || undefined };
    case "REBUTTAL_NEEDS_TARGET":
      return { code, message: "A rebuttal must answer another Dispatch.", hint: "Use the Reply button on the Dispatch you want to answer." };
    case "TARGET_UNAVAILABLE":
      return { code, message: "That Dispatch has been withdrawn or hidden, so it cannot be answered." };
    case "TARGET_NOT_IN_CAMPAIGN":
    case "ONLY_REBUTTALS_REPLY":
      return { code, message: "Only a rebuttal can reply to another Dispatch in the same Campaign." };
    case "ARGUMENT_NO_SOURCES":
      return { code, message: "Arguments do not carry links.", hint: "Post your sources as an Evidence Dispatch, or remove the links.", field: "sources" };
    case "EVIDENCE_NEEDS_SOURCE":
      return { code, message: "Evidence needs at least one source link.", field: "sources" };
    case "SOURCE_INVALID":
      return { code, message: "One of the links is not a valid web address.", hint: "Links must start with http:// or https://.", field: "sources" };
    case "NOT_YOURS":
      return { code, message: "You can only change your own Dispatches." };
    case "NOT_EDITABLE":
      return { code, message: "This Dispatch has been withdrawn or hidden, so it cannot be edited." };
    case "EDIT_WINDOW_OVER":
      return { code, message: `Dispatches can be edited for ${Math.round((detail || 300) / 60)} minutes after posting.`, hint: "That time has passed. You can post a new Dispatch, or withdraw this one." };
    case "OWN_DISPATCH":
      return { code, message: "You cannot do that to your own Dispatch." };
    case "NOT_AVAILABLE":
      return { code, message: "This Dispatch can no longer be reacted to." };
    case "UNKNOWN_REACTION":
      return { code, message: "That reaction is not available." };
    default:
      return { code, message: "Something went wrong.", hint: "Please try again in a moment. Your text is kept." };
  }
}

// ---------------------------------------------------------------------------
// Time windows (always from the server's clock)
// ---------------------------------------------------------------------------

/** Seconds left to edit a Dispatch posted at `createdAt`, or 0 once the window has passed. */
export function editSecondsLeft(createdAt: string, now: number, limits: Pick<DispatchLimits, "edit_window_seconds">): number {
  return Math.max(0, Math.ceil((Date.parse(createdAt) + limits.edit_window_seconds * 1000 - now) / 1000));
}

/** Seconds until the cooldown after `lastPostedAt` ends, or 0 when posting is allowed. */
export function cooldownSecondsLeft(lastPostedAt: string | null, now: number, limits: Pick<DispatchLimits, "cooldown_seconds">): number {
  if (!lastPostedAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(lastPostedAt) + limits.cooldown_seconds * 1000 - now) / 1000));
}

/** Dispatches left in this round, never below zero. */
export function postsLeftInRound(postedThisRound: number, limits: Pick<DispatchLimits, "max_dispatches_per_round">): number {
  return Math.max(0, limits.max_dispatches_per_round - postedThisRound);
}
