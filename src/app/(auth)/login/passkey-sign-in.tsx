"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { browserSupportsWebAuthn, startAuthentication, WebAuthnError } from "@simplewebauthn/browser";
import { FormMessage, type FormState } from "@/components/form";
import { Button } from "@/components/ui/button";
import { beginPasskeySignIn, finishPasskeySignIn } from "../passkey-actions";

export function PasskeySignIn({ next }: { next: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({});

  function signInWithPasskey() {
    if (!browserSupportsWebAuthn()) {
      setState({
        formError: "This browser cannot use passkeys.",
        formHint: "Please sign in with your email and password instead.",
      });
      return;
    }
    startTransition(async () => {
      const begin = await beginPasskeySignIn();
      if (!begin.ok) return setState({ formError: begin.message });
      try {
        const response = await startAuthentication({ optionsJSON: begin.data });
        const finish = await finishPasskeySignIn(response, next);
        if (!finish.ok) return setState({ formError: finish.message });
        router.push(finish.data);
        router.refresh();
      } catch (error) {
        const cancelled = error instanceof WebAuthnError && error.code === "ERROR_CEREMONY_ABORTED";
        const notAllowed = error instanceof Error && error.name === "NotAllowedError";
        setState({
          formError: cancelled || notAllowed ? "Passkey sign-in was cancelled." : "Passkey sign-in did not work.",
          formHint: "You can try again, or sign in with your email and password.",
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormMessage state={state} />
      <Button type="button" variant="outline" size="full" onClick={signInWithPasskey} disabled={pending}>
        <KeyRound aria-hidden />
        {pending ? "Waiting for your passkey…" : "Sign in with a passkey"}
      </Button>
      <p className="text-base text-muted-foreground">
        A passkey lets you sign in with your fingerprint, face or device PIN instead of a password. You can add one from your
        Account page after you sign in.
      </p>
    </div>
  );
}
