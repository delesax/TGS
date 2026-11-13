import { readFileSync } from "node:fs";
import path from "node:path";

// Prompts live in versioned files, prompts/<name>.vN.md, so every stored
// decision names the exact wording that produced it. To change a prompt, add
// a new version file and bump the number here; never edit an old version.

export const PROMPTS = {
  screen_dispatch: { name: "screen-dispatch", version: 1 },
  screen_text: { name: "screen-text", version: 1 },
  nudge: { name: "nudge", version: 1 },
  coach: { name: "coach", version: 1 },
  judge_rubric: { name: "judge-rubric", version: 1 },
  judge_rationale: { name: "judge-rationale", version: 1 },
} as const;

export type PromptKey = keyof typeof PROMPTS;

/**
 * Prompts that have more than one version on disk. The default above is what
 * runs unless the caller asks for another. The judge rubric has v1 (frozen) and
 * v2 (Sprint 7: tells the model it cannot verify sources and asks for
 * unverified_claims). Which one the judge uses is the judging setting
 * `judge_prompt_version`, so it can be switched back without a deploy.
 */
export const AVAILABLE_VERSIONS: Partial<Record<PromptKey, readonly number[]>> = { judge_rubric: [1, 2] };

const cache = new Map<string, string>();

export function promptVersion(key: PromptKey, version?: number): string {
  const v = version ?? PROMPTS[key].version;
  if (version !== undefined && !(AVAILABLE_VERSIONS[key] ?? [PROMPTS[key].version]).includes(version)) {
    throw new Error(`No version ${version} of the ${PROMPTS[key].name} prompt`);
  }
  return `${PROMPTS[key].name}.v${v}`;
}

export function loadPrompt(key: PromptKey, requested?: number): { text: string; version: string } {
  const version = promptVersion(key, requested);
  let text = cache.get(version);
  if (text === undefined) {
    text = readFileSync(path.join(process.cwd(), "prompts", `${version}.md`), "utf8").trim();
    cache.set(version, text);
  }
  return { text, version };
}
