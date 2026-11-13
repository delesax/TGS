import { normaliseHandle } from "../handle-stub";
import type { CoachOutput, DispatchScreenOutput, JudgeRubricOutput, NudgeOutput, TextScreenOutput } from "../schemas";
import { extractBlocks } from "../untrusted";
import type { AiProvider, ProviderRequest, ProviderResponse } from "./types";

// A deterministic, keyword-driven stand-in for the model (AI_PROVIDER=fake).
// Used for local development, unit tests, Playwright and CI, so none of them
// ever call the real API. It reads only the untrusted text, exactly as the
// real model receives it, and ignores any instructions inside it.
//
// Test markers (fake provider only): [[ai-timeout]] never answers,
// [[ai-invalid]] answers with broken JSON, [[ai-error]] fails.

const normalise = (s: string) => s.toLowerCase().replace(/[’`]/g, "'");

type Rule = { category: DispatchScreenOutput["category"]; patterns: RegExp[]; confidence: number; reason: string };

const DISPATCH_RULES: Rule[] = [
  {
    category: "self_harm",
    confidence: 0.97,
    reason: "Encourages someone to harm or kill themselves.",
    patterns: [/\bkill yourself\b/, /\bkys\b/, /\byou should (?:just )?end it\b/, /\bgo (?:and )?die\b/],
  },
  {
    category: "threats",
    confidence: 0.96,
    reason: "Threatens violence against a person.",
    patterns: [
      /\b(?:i'?ll|i will|we will|we'?ll|gonna|going to) (?:kill|hurt|find|get|beat|smash) (?:you|him|her|them)\b/,
      /\bdeserves? to (?:die|be shot|be hanged)\b/,
      /\bshould be (?:shot|hanged|lynched|strung up)\b/,
      /\bwatch your back\b/,
      /\bburn (?:your|his|her|their) house\b/,
      /\bi know where you live\b/,
    ],
  },
  {
    category: "personal_information",
    confidence: 0.95,
    reason: "Shares someone's private contact or location details.",
    patterns: [
      /\b(?:his|her|their|your) (?:home )?address is\b/,
      /\blives at \d+/,
      /\b07\d{3} ?\d{6}\b/,
      /\b(?:phone|mobile) number is\b/,
      /\b(?:contact|email) (?:him|her|them) (?:privately )?at [\w.+-]+@[\w-]+\.\w+/,
    ],
  },
  {
    category: "hate",
    confidence: 0.93,
    reason: "Dehumanises a group of people.",
    patterns: [
      /\b(?:are|is) (?:all |just |nothing but )?(?:vermin|parasites|subhuman|cockroaches|animals|a disease|an infestation)\b/,
      /\bgo back to (?:your|their) (?:own )?country\b/,
      /\b(?:should|must) all be (?:deported|exterminated|wiped out|removed from this country)\b/,
      /\b(?:should|must) be (?:exterminated|wiped out)\b/,
      /\byour kind\b/,
    ],
  },
  {
    category: "impersonation",
    confidence: 0.88,
    reason: "Claims to be TGS staff or an official account.",
    patterns: [
      /\b(?:as|i am|i'?m) (?:a |the )?(?:tgs|official) (?:moderator|admin|staff)\b/,
      /\bthis is (?:the )?tgs (?:team|staff|admin)\b/,
      /\bofficial (?:notice|warning) from (?:the )?(?:tgs|grand strategist)\b/,
      /\bi am the (?:real|actual) (?:prime minister|king|chancellor)\b/,
    ],
  },
  {
    category: "harassment",
    confidence: 0.86,
    reason: "Insults another person rather than their argument.",
    patterns: [
      /\byou(?:'re| are) (?:a |an |such a |an absolute |a complete )?(?:idiot|moron|imbecile|cretin|clown|halfwit|pathetic|disgrace|loser|joke)\b/,
      /@\w+ (?:is|are) (?:a |an )?(?:idiot|moron|imbecile|clown|liar|fraud|pathetic|thick)\b/,
      /\bshut (?:up|your mouth)\b/,
      /\bnobody (?:likes|cares about) you\b/,
      /\bbrain-?dead\b/,
      /\bget lost,? you\b/,
    ],
  },
  {
    category: "sexual_content",
    confidence: 0.9,
    reason: "Contains sexual content.",
    patterns: [/\b(?:porn|pornographic|nude photos|sexual favours)\b/],
  },
  {
    category: "spam",
    confidence: 0.85,
    reason: "Advertising unrelated to the debate.",
    patterns: [/\bbuy now\b/, /\bdiscount code\b/, /\bcrypto giveaway\b/, /\bclick here\b/, /\bvisit my (?:shop|store|channel)\b/, /\bguaranteed returns\b/],
  },
];

const AI_MARKERS = [
  /\bas an ai (?:language )?model\b/,
  /\bi hope this helps\b/,
  /\bcertainly! here\b/,
  /\bit(?:'s| is) important to note that\b/,
  /\bin conclusion, (?:while|it is)\b/,
  /\bdelve into\b/,
  /\bin today's (?:fast-paced|ever-changing) world\b/,
  /\bmultifaceted (?:issue|question|debate)\b/,
];

/** True when a match sits inside quotation marks: someone quoting abuse, often to criticise it. */
function insideQuotes(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const opens = (before.match(/["“]/g) ?? []).length - (before.match(/[”]/g) ?? []).length;
  return opens % 2 === 1;
}

export function fakeScreenDispatch(raw: string): DispatchScreenOutput {
  const text = normalise(raw);
  const aiHits = AI_MARKERS.filter((re) => re.test(text)).length;
  const likely_ai_generated = aiHits >= 1;
  const ai_generated_reason = likely_ai_generated ? "Uses phrasing typical of AI assistants." : "";
  for (const rule of DISPATCH_RULES) {
    for (const re of rule.patterns) {
      const m = re.exec(text);
      if (!m) continue;
      const quoted = insideQuotes(text, m.index);
      return {
        category: rule.category,
        // Quoting abuse to criticise it is borderline: low confidence, so it is
        // held only on sensitive Campaigns.
        confidence: quoted ? 0.5 : rule.confidence,
        reason: quoted ? `Quotes possibly abusive words (${rule.category.replace("_", " ")}); may be criticising them.` : rule.reason,
        likely_ai_generated,
        ai_generated_reason,
      };
    }
  }
  return { category: "none", confidence: 0.95, reason: "No problems found.", likely_ai_generated, ai_generated_reason };
}

const NAME_RULES: { category: TextScreenOutput["category"]; patterns: RegExp[]; reason: string }[] = [
  {
    category: "impersonation",
    patterns: [/official/, /verified/, /^real_?/, /moderat/, /helpdesk/, /primeminister/, /hmgovernment/, /bbcnews/],
    reason: "This name could be mistaken for an official account or a well-known person. Please choose another.",
  },
  { category: "hate", patterns: [/whitepower/, /heil/, /1488/, /gasthe/, /subhuman/], reason: "This name breaks our community rules on hate. Please choose another." },
  { category: "sexual_content", patterns: [/porn/, /sexy/, /nsfw/, /xxx/], reason: "This name is not suitable for a public debate. Please choose another." },
  { category: "harassment", patterns: [/youreanidiot/, /idiot/, /moron/, /loser/], reason: "This name could be read as an insult. Please choose another." },
  { category: "spam", patterns: [/www/, /\.com/, /buynow/, /promo/], reason: "Names cannot advertise or include web addresses. Please choose another." },
];

export function fakeScreenText(raw: string): TextScreenOutput {
  // Both with look-alikes undone ("m0der4tor") and as typed ("1488").
  const texts = [normaliseHandle(raw), raw.toLowerCase()].map((t) => t.replace(/[\s_-]+/g, ""));
  for (const rule of NAME_RULES) {
    if (rule.patterns.some((re) => texts.some((t) => re.test(t)))) return { category: rule.category, confidence: 0.9, reason: rule.reason };
  }
  return { category: "none", confidence: 0.95, reason: "No problems found." };
}

const NUDGE_RULES: { kind: NudgeOutput["kind"]; pattern: RegExp }[] = [
  { kind: "insult", pattern: /\byou(?:'re| are) (?:a |an |such a |an absolute |a complete )?(?:idiot|moron|imbecile|clown|fool|halfwit|joke|pathetic)\b/ },
  { kind: "personal_attack", pattern: /@(\w+) (?:is|are) (?:a |an |clearly |obviously )?(?:idiot|moron|clown|liar|fraud|clueless|thick|stupid|pathetic|ignorant)\b/ },
  { kind: "hostile_tone", pattern: /\bshut (?:up|your mouth)\b|\bhow (?:stupid|thick) (?:are|can) you\b|\bget lost\b/ },
  { kind: "mocking", pattern: /\b(?:lol|lmao)\b.*\byou\b|\bbless your heart\b|\bnice try,? genius\b/ },
];

export function fakeNudge(raw: string): NudgeOutput {
  const text = normalise(raw);
  for (const rule of NUDGE_RULES) {
    const m = rule.pattern.exec(text);
    if (!m) continue;
    const who = rule.kind === "personal_attack" && m[1] ? ` on @${raw.match(new RegExp(`@(${m[1]})`, "i"))?.[1] ?? m[1]}` : "";
    return { kind: rule.kind, message: `This reads as a personal attack${who}. Consider answering the argument, not the person.` };
  }
  return { kind: "none", message: "" };
}

export function fakeCoach(raw: string): CoachOutput {
  const text = normalise(raw);
  const firstSentence = text.split(/[.!?]\s/)[0] ?? "";
  const clear = /\b(should|must|i (?:think|believe|argue)|because|the case for|the case against)\b/.test(firstSentence);
  const evidenceHits = [/\d/, /\b(?:study|report|survey|data|evidence|statistics|research|ons|nhs)\b/, /\bfor example\b|\bfor instance\b|\be\.g\./, /\bbecause\b/].filter((re) => re.test(text)).length;
  const steel = /\b(?:opponents|critics|some argue|admittedly|it is true that|the strongest (?:argument|case) against|to be fair)\b/.test(text)
    ? "acknowledged"
    : /\b(?:however|although|while it|on the other hand)\b/.test(text)
      ? "partly"
      : "missing";
  const hostile = NUDGE_RULES.some((r) => r.pattern.test(text)) || DISPATCH_RULES.find((r) => r.category === "harassment")!.patterns.some((re) => re.test(text));
  const shouting = (raw.match(/!/g) ?? []).length >= 3 || /\b[A-Z]{5,}\b.*\b[A-Z]{5,}\b/.test(raw);

  const questions: string[] = [];
  if (!clear) questions.push("What is the one claim you most want a reader to accept, and could you state it in your first sentence?");
  if (evidenceHits < 2) questions.push("What evidence or example would persuade someone who doubts this claim?");
  if (steel !== "acknowledged") questions.push("What is the strongest point the other side would make, and how would you answer it fairly?");
  if (hostile || shouting) questions.push("Which parts answer the argument, and which parts are aimed at the person making it?");
  if (!questions.length) questions.push("Which single point would you cut if you had to make this shorter?");

  return {
    clarity: {
      rating: raw.trim().length < 80 ? "unclear" : clear ? "clear" : "partly_clear",
      comment: clear ? "Your main claim comes through early." : "The main claim is not stated clearly at the start.",
    },
    evidence: {
      rating: evidenceHits >= 3 ? "strong" : evidenceHits >= 1 ? "some" : "none",
      comment: evidenceHits >= 1 ? "You give some support for the claim; check it would convince a sceptic." : "The claim rests on assertion so far, with no evidence or example.",
    },
    steelman: {
      rating: steel,
      comment:
        steel === "acknowledged"
          ? "You recognise the opposing case before answering it."
          : steel === "partly"
            ? "You hint at the other side but do not set out its strongest point."
            : "The draft does not yet engage with the strongest opposing point.",
    },
    tone: {
      rating: hostile ? "hostile" : shouting ? "mixed" : "constructive",
      comment: hostile ? "Parts of this are aimed at a person rather than their argument." : shouting ? "Exclamation marks and capitals may read as shouting." : "The tone argues with ideas, not people.",
    },
    questions: questions.slice(0, 4),
  };
}

// Judging (Sprint 5): a crude, deterministic stand-in for the rubric. It counts
// surface features (connectives, evidence words, engagement with the other
// side, vocabulary). Good enough to exercise the whole pipeline and the eval
// harness; it is NOT a judge, and its eval numbers say nothing about the real model.
const count = (text: string, patterns: RegExp[]) => patterns.reduce((n, re) => n + (text.match(re)?.length ?? 0), 0);
const clamp15 = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

const STEELMAN = /\b(?:the strongest (?:case|argument|point|objection) (?:for|against)|to be fair to|restating (?:your|their|the other) (?:view|case)|the best case for the other side|i accept that (?:opponents|critics|the other side)|opponents are right that|critics rightly)\b/;

/** Prompt v2 stand-in: up to three sentences that lean on a figure, a study or a quote and carry no link. A crude heuristic, NOT the model. */
export function fakeUnverifiedClaims(raw: string): string[] {
  const sentences = raw.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const checkable = /(\d[\d,.]*\s?(?:%|per cent|percent)|[£$€]\s?\d|\b(?:19|20)\d\d\b|\b(?:study|survey|report|poll|trial|research|according to)\b)/i;
  return sentences.filter((s) => checkable.test(s) && !/https?:\/\//.test(s)).slice(0, 3).map((s) => s.slice(0, 160));
}

export function fakeJudgeRubric(raw: string, kind: string, parent: string | null): JudgeRubricOutput {
  const text = normalise(raw);
  const words = text.match(/[a-z']+/g) ?? [];
  const short = raw.trim().length < 80;
  const hostile = NUDGE_RULES.some((r) => r.pattern.test(text));
  const connectives = count(text, [/\bbecause\b/g, /\btherefore\b/g, /\bwhich means\b/g, /\bas a result\b/g, /\bso that\b/g, /\bit follows\b/g, /\bif\b[^.]*\bthen\b/g, /\bsince\b/g]);
  const claim = /\b(?:should|must|i (?:think|believe|argue)|the case (?:for|against))\b/.test(text) ? 1 : 0;
  const evidence = count(text, [
    /\b\d[\d,.]*\s?(?:%|per cent|percent)/g,
    /£\s?\d/g,
    /\b(?:19|20)\d\d\b/g,
    /\b(?:study|studies|report|survey|data|figures|statistics|research|trial|audit|census)\b/g,
    /\baccording to\b/g,
    /\b(?:ons|nhs|ofgem|ofsted|oecd|ifs|bank of england)\b/g,
    /\bfor (?:example|instance)\b/g,
    /https?:\/\//g,
  ]);
  const engagement = count(text, [
    /\byou (?:argue|say|claim|suggest)\b/g,
    /\bthe other side\b/g,
    /\b(?:opponents|critics|sceptics|supporters)\b/g,
    /\b(?:however|admittedly|to be fair|fair point|i accept|that assumes|your point)\b/g,
  ]);
  const longWords = new Set(words.filter((w) => w.length > 6)).size;

  const steelmanPresent = STEELMAN.test(text);
  const scores = {
    logic: short ? 1 : clamp15(1.5 + connectives + claim - (hostile ? 2 : 0)),
    evidence: short ? 1 : clamp15(1 + evidence * 0.9),
    originality: short ? 1 : clamp15(longWords < 5 ? 1 : longWords < 10 ? 2 : longWords < 18 ? 3 : longWords < 28 ? 4 : 5),
    responsiveness: short ? 1 : clamp15(1 + engagement + (kind === "rebuttal" && parent ? 1 : 0) + (steelmanPresent ? 1 : 0) - (hostile ? 1 : 0)),
  };
  return {
    ...scores,
    rationale: `Stand-in scores from surface features: ${connectives} reasoning link(s), ${evidence} evidence marker(s), ${engagement} sign(s) of engaging with others.`,
    steelman: steelmanPresent
      ? { present: true, confidence: 0.8, note: "Restates the opposing case before answering it." }
      : { present: false, confidence: 0.2, note: "No fair restatement of the opposing view found." },
  };
}

const wait = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });

export const fakeProvider: AiProvider = {
  name: "fake",
  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const blocks = extractBlocks(req.user);
    const all = Object.values(blocks).join("\n");
    if (all.includes("[[ai-timeout]]")) return wait(req.signal);
    if (all.includes("[[ai-error]]")) throw new Error("fake provider error");
    const tokens = { inputTokens: Math.ceil((req.system.length + req.user.length) / 4), outputTokens: 60 };
    if (all.includes("[[ai-invalid]]")) return { text: '{"category": "none", "confidence": "very sure"', ...tokens };
    const output =
      req.task === "screen_dispatch"
        ? fakeScreenDispatch(blocks.dispatch ?? "")
        : req.task === "screen_text"
          ? fakeScreenText(blocks.name ?? "")
          : req.task === "nudge"
            ? fakeNudge(blocks.draft ?? "")
            : req.task === "judge_rubric"
              ? {
                  ...fakeJudgeRubric(blocks.dispatch ?? "", /Dispatch kind: (\w+)/.exec(req.user)?.[1] ?? "argument", blocks.replying_to ?? null),
                  // Prompt v2 asks for the list; v1 does not.
                  ...("unverified_claims" in ((req.schema as { properties?: Record<string, unknown> }).properties ?? {}) ? { unverified_claims: fakeUnverifiedClaims(blocks.dispatch ?? "") } : {}),
                }
              : req.task === "judge_rationale"
                ? { rationale: blocks.draft ?? "" }
                : fakeCoach(blocks.draft ?? "");
    return { text: JSON.stringify(output), ...tokens };
  },
};
