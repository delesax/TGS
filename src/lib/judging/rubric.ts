// The published rubric (CLAUDE.md rule 7), in plain words. The four criteria are the ones the AI judge scores
// (prompts/judge-rubric.v1.md); the blend weights come from the database (public.judging_weights, pinned to a
// Campaign when its rubric is published).

export const RUBRIC_CRITERIA = [
  { key: "logic", label: "Logic", text: "Is the reasoning sound and the main claim clear?" },
  { key: "evidence", label: "Evidence", text: "Is the claim backed by facts, examples or sources a sceptic would accept?" },
  { key: "originality", label: "Originality", text: "Does it add something the debate does not already have?" },
  { key: "responsiveness", label: "Responsiveness", text: "Does it engage fairly with what others have said, especially the strongest opposing point?" },
] as const;

export type PublishedRubric = {
  publishedAt: string;
  weights: { panel: number; peer: number; ai_rubric: number; mind_change: number } | null;
  steelmanBonusMax: number | null;
};

export const BLEND_PARTS = [
  { key: "panel", label: "Panel of judges", text: "People chosen to judge, who score each Dispatch." },
  { key: "peer", label: "Peer votes", text: "Votes from Strategists who took part, weighted by reputation and limited by vote credits so a crowd cannot swamp a thoughtful minority." },
  { key: "ai_rubric", label: "AI rubric", text: "An AI model scores each Dispatch on the four criteria above. It is advice only, and a person can override it." },
  { key: "mind_change", label: "Mind-change", text: "How far a Dispatch moved other Strategists' recorded positions." },
] as const;
