"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserCheck, UserPlus } from "lucide-react";
import { setStrategistFollow } from "@/app/strategists/actions";
import { Button } from "@/components/ui/button";

export function FollowStrategistButton({ id, handle, following, compact = false }: { id: string; handle: string; following: boolean; compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={following ? "outline" : "secondary"}
        aria-pressed={following}
        disabled={pending}
        className="self-start"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await setStrategistFollow(id, handle, !following);
            if (result.ok) router.refresh();
            else setError(result.message);
          })
        }
      >
        {following ? <UserCheck aria-hidden /> : <UserPlus aria-hidden />}
        {pending ? "Saving…" : following ? (compact ? "Unfollow" : `Following @${handle}. Unfollow`) : `Follow @${handle}`}
      </Button>
      {error ? (
        <p role="alert" className="text-base font-semibold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
