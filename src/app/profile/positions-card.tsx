"use client";

import { useActionState } from "react";
import { FormMessage, type FormState } from "@/components/form";
import { Button } from "@/components/ui/button";
import { stopRecordingPositions } from "./positions-actions";

export function StopPositionsForm({ consented }: { consented: boolean }) {
  const [state, action, pending] = useActionState(stopRecordingPositions, {} as FormState);
  return (
    <div className="flex flex-col gap-4">
      <FormMessage state={state} />
      {consented ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            action();
          }}
        >
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Stopping…" : "Stop recording my positions"}
          </Button>
        </form>
      ) : (
        <p className="text-lg">You have not agreed to us recording your positions, so none are recorded. You are asked the first time you record one.</p>
      )}
    </div>
  );
}
