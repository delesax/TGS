import { describe, expect, it } from "vitest";
import fixtures from "../../../evals/coach-validator-false-positives.json";
import { replacementTextRule } from "./policy";
import { coachSchema, type CoachOutput } from "./schemas";

// The quoted-passage rule rejected 8 of 20 real coach answers on 19 Nov 2026, every one a false positive: it took apostrophes
// ("doesn't", "team's") and single-quote scare quotes ('reduced') for quotation marks. The fixtures are those raw model answers.

const base: CoachOutput = {
  clarity: { rating: "clear", comment: "Your claim is stated in the first line." },
  evidence: { rating: "some", comment: "One figure supports it; what else would a sceptic accept?" },
  steelman: { rating: "missing", comment: "The strongest opposing point is not addressed." },
  tone: { rating: "constructive", comment: "You argue with ideas." },
  questions: ["What would someone who disagrees say first?"],
};
const withQuestion = (q: string): CoachOutput => ({ ...base, questions: [q] });

describe("the real answers the validator wrongly rejected", () => {
  it("has the fixtures", () => {
    expect(fixtures.items.length).toBeGreaterThanOrEqual(25);
  });
  for (const f of fixtures.items) {
    it(`${f.id} v${f.promptVersion} try ${f.attempt} is accepted now`, () => {
      const parsed = coachSchema.safeParse(JSON.parse(f.rawText));
      // An answer that also broke the schema is a different failure; none of these do.
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(replacementTextRule(parsed.data, f.draft)).toBeNull();
    });
  }
});

describe("replacement text is still caught", () => {
  const passage = "Trials across forty firms show lower sick leave and steady output overall";
  it("a long double-quoted passage that is not in the draft", () => {
    expect(replacementTextRule(withQuestion(`Try: "${passage}."`), "My draft.")).toMatch(/^long_quote_not_in_draft/);
  });
  it("a long single-quoted passage that is not in the draft", () => {
    expect(replacementTextRule(withQuestion(`You might open with '${passage}.' instead?`), "My draft.")).toMatch(/^long_quote_not_in_draft/);
  });
  it("a long curly-double-quoted passage, with an apostrophe inside it", () => {
    expect(replacementTextRule(withQuestion(`Try “Don't wait: ${passage}.”`), "My draft.")).toMatch(/^long_quote_not_in_draft/);
  });
  it("a rewrite phrase", () => {
    expect(replacementTextRule(withQuestion("You could write it as a question instead?"), "d")).toMatch(/^rewrite_phrase/);
  });
  it("quoting the writer's own words back is fine, with or without apostrophes", () => {
    const own = `${passage} and it doesn't cost more`;
    expect(replacementTextRule(withQuestion(`You say "${own}": what is your source?`), own)).toBeNull();
    expect(replacementTextRule(withQuestion(`You say '${own}': what is your source?'`), own)).toBeNull();
  });
});

describe("ordinary feedback with apostrophes and short quotes is not a quotation", () => {
  it("contractions and possessives", () => {
    expect(replacementTextRule(withQuestion("It doesn't say who benefits, and the team's own account isn't evidence a sceptic could weigh up, is it?"), "d")).toBeNull();
  });
  it("short single-quote scare quotes with a contraction between them", () => {
    expect(replacementTextRule(withQuestion("The word 'reduced' is vague and it doesn't say by how much, so what does 'norm' mean in practice?"), "d")).toBeNull();
  });
  it("a closing double quote is not read as the next opening one", () => {
    expect(replacementTextRule(withQuestion('You say "every parent knows" and that "it works"; what would you say to someone who doesn\'t agree with that?'), "d")).toBeNull();
  });
});

// Adversarial cases from the review of the fix: a rewrite must not slip through because of how it is quoted, and an apostrophe
// must not stop a real quote that follows it from being found.
describe("adversarial quoting", () => {
  const passage = "Trials across forty firms show lower sick leave and steady output overall";
  const rewrite = `Don't wait: ${passage}, and it doesn't cost more`;
  const draft = "My draft.";
  const caught = (q: string) => expect(replacementTextRule(withQuestion(q), draft)).toMatch(/^long_quote_not_in_draft/);
  const fine = (q: string) => expect(replacementTextRule(withQuestion(q), draft)).toBeNull();

  it("(a) a rewrite in double quotes that contains apostrophes and contractions is rejected", () => {
    caught(`Try "${rewrite}."`);
    caught(`Try “${rewrite}.”`);
  });

  it("(b) a single-quoted rewrite is rejected when the opening quote follows a bracket, a digit or punctuation", () => {
    caught(`Try ('${passage}.')`);
    caught(`Try [‘${passage}.’]`);
    caught(`Option 2'${passage}.'`);
    caught(`Try 1:'${passage}.'`);
    caught(`Try: '${rewrite}.'`);
    caught(`Try ‘${rewrite}.’ instead`);
  });

  it("(c) a plural possessive is not a quote opener and does not hide a real quote after it", () => {
    fine("What do teachers' phones in class add to the argument, and what would the teachers' union say about them?");
    fine("The pupils' and teachers' views differ, and nothing in the draft says whose evidence a sceptic should trust more.");
    caught(`The teachers' view is stated, but try '${passage}.' instead`);
    caught(`What would the teachers' union say? Try "${passage}."`);
    caught(`The teachers' 'case' is thin; try '${rewrite}.'`);
  });

  it("a digit followed by 's is a possessive or plural, not an opening quote", () => {
    fine("In the 1990's the figure was lower, and in the firms' own accounts it is higher, so which does your claim rely on?");
  });
});
