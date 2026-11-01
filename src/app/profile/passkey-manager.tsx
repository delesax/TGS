"use client";

import { useState, useTransition } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { browserSupportsWebAuthn, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import { FormMessage, type FormState } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { beginPasskeyRegistration, finishPasskeyRegistration, removePasskey } from "@/app/(auth)/passkey-actions";

export type PasskeySummary = { id: string; nickname: string | null; created_at: string; last_used_at: string | null };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function PasskeyManager({ passkeys, loadFailed }: { passkeys: PasskeySummary[]; loadFailed: boolean }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({});
  const [nickname, setNickname] = useState("");

  function addPasskey() {
    if (!browserSupportsWebAuthn()) {
      setState({ formError: "This browser cannot create passkeys.", formHint: "Try a recent version of Safari, Chrome, Edge or Firefox." });
      return;
    }
    startTransition(async () => {
      const begin = await beginPasskeyRegistration();
      if (!begin.ok) return setState({ formError: begin.message });
      try {
        const response = await startRegistration({ optionsJSON: begin.data });
        const finish = await finishPasskeyRegistration(response, nickname);
        if (!finish.ok) return setState({ formError: finish.message });
        setNickname("");
        setState({ success: "Passkey added. Next time, choose “Sign in with a passkey”." });
      } catch (error) {
        const already = error instanceof WebAuthnError && error.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED";
        setState({
          formError: already ? "This device already has a passkey for your account." : "The passkey was not added.",
          formHint: already ? "You can already sign in with it." : "You may have cancelled it. You can try again.",
        });
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await removePasskey(id);
      setState(result.ok ? { success: "Passkey removed." } : { formError: result.message });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <FormMessage state={state} />
      {loadFailed ? (
        <p role="alert" className="text-lg text-destructive">
          We could not load your passkeys. Please refresh the page.
        </p>
      ) : passkeys.length === 0 ? (
        <p className="text-lg text-muted-foreground">You have not added a passkey yet.</p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Your passkeys">
          {passkeys.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{p.nickname || "Passkey"}</p>
                <p className="text-base text-muted-foreground">
                  Added {dateFormat.format(new Date(p.created_at))}
                  {p.last_used_at ? ` · last used ${dateFormat.format(new Date(p.last_used_at))}` : ""}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => remove(p.id)} disabled={pending}>
                <Trash2 aria-hidden />
                Remove<span className="sr-only"> {p.nickname || "passkey"}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="passkey-nickname">Name this device (optional)</Label>
        <p id="passkey-nickname-hint" className="text-base text-muted-foreground">
          For example: My iPhone. It helps you tell your passkeys apart.
        </p>
        <Input
          id="passkey-nickname"
          aria-describedby="passkey-nickname-hint"
          value={nickname}
          maxLength={60}
          onChange={(e) => setNickname(e.target.value)}
        />
      </div>
      <Button type="button" onClick={addPasskey} disabled={pending} size="full">
        <KeyRound aria-hidden />
        {pending ? "Waiting for your device…" : "Add a passkey on this device"}
      </Button>
    </div>
  );
}
