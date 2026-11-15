"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton, type FormState } from "@/components/form";
import { publishRubric } from "./actions";

export function RubricPanel({ campaignId, publishedLabel }: { campaignId: string; publishedLabel: string | null }) {
  const [state, action, pending] = useActionState(publishRubric, {} as FormState);
  return (
    <section aria-labelledby="rubric-admin-h" className="flex flex-col gap-3 rounded-lg border border-hairline p-4">
      <h2 id="rubric-admin-h">
        Rubric
      </h2>
      {publishedLabel ? (
        <p className="text-base">
          Published {publishedLabel}. The four criteria and the judging weights in force at that moment are now shown on the public Campaign page and are fixed for this Campaign.
        </p>
      ) : (
        <>
          <p className="text-base">
            Not published. Rule 7 says the rubric is published before a Campaign opens, so a draft cannot be scheduled until you publish it. Publishing fixes the current judging weights for this Campaign and shows how it is judged on its public page. It cannot be undone.
          </p>
          <ActionForm action={action} aria-label="Rubric publication">
            <FormMessage state={state} />
            <input type="hidden" name="id" value={campaignId} />
            <SubmitButton pending={pending} pendingLabel="Publishing…">
              Publish the rubric
            </SubmitButton>
          </ActionForm>
        </>
      )}
    </section>
  );
}
