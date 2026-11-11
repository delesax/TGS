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

const cache = new Map<string, string>();

export function promptVersion(key: PromptKey): string {
  return `${PROMPTS[key].name}.v${PROMPTS[key].version}`;
}

export function loadPrompt(key: PromptKey): { text: string; version: string } {
  const version = promptVersion(key);
  let text = cache.get(version);
  if (text === undefined) {
    text = readFileSync(path.join(process.cwd(), "prompts", `${version}.md`), "utf8").trim();
    cache.set(version, text);
  }
  return { text, version };
}
