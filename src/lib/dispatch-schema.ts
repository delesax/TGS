import { z } from "zod";
import { AI_USES, MAX_SOURCES, maxCharsFor, type DispatchLimits } from "./dispatches";

// Server-side validation of a Dispatch before post_dispatch() checks it again.
// Kept apart from dispatches.ts so the validation library stays off the browser.

export function dispatchInputSchema(limits: DispatchLimits) {
  return z
    .object({
      kind: z.enum(["argument", "rebuttal", "evidence"], "Choose the kind of Dispatch."),
      body: z.string().trim().min(1, "Write your Dispatch before posting."),
      aiUse: z.enum(AI_USES, "Say whether you used AI. Choose one of the three options."),
      parentId: z.uuid().nullable(),
      sources: z.array(z.object({ url: z.string(), host: z.string(), title: z.string().optional() })),
    })
    .superRefine((v, ctx) => {
      const max = maxCharsFor(v.kind, limits);
      if (v.body.length > max) {
        ctx.addIssue({ code: "custom", path: ["body"], message: `Keep it to ${max.toLocaleString("en-GB")} characters. You have ${v.body.length.toLocaleString("en-GB")}.` });
      }
      if (v.kind === "rebuttal" && !v.parentId) {
        ctx.addIssue({ code: "custom", path: ["body"], message: "A rebuttal answers another Dispatch. Use the Reply button on the Dispatch you want to answer." });
      }
      if (v.kind !== "rebuttal" && v.parentId) {
        ctx.addIssue({ code: "custom", path: ["kind"], message: "Only a rebuttal can reply to another Dispatch." });
      }
      if (v.kind === "argument" && v.sources.length) {
        ctx.addIssue({ code: "custom", path: ["sources"], message: "Arguments do not carry links. Post your sources as an Evidence Dispatch, or remove the links." });
      }
      if (v.kind === "evidence" && !v.sources.length) {
        ctx.addIssue({ code: "custom", path: ["sources"], message: "Evidence needs at least one source link." });
      }
      if (v.sources.length > MAX_SOURCES) {
        ctx.addIssue({ code: "custom", path: ["sources"], message: `Add at most ${MAX_SOURCES} links.` });
      }
    });
}

export type DispatchInput = z.infer<ReturnType<typeof dispatchInputSchema>>;
