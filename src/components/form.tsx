"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type FormState = {
  /** Message for the whole form. Stays on screen until dismissed or the form is sent again. */
  formError?: string;
  /** What to do next, shown under formError. */
  formHint?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
};

/**
 * A form that calls a server action without clearing what the person typed.
 * React resets forms that use the `action` prop, so we submit by hand instead.
 */
export function ActionForm({
  action,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & { action: (data: FormData) => void }) {
  return (
    <form
      noValidate
      className={cn("flex flex-col gap-6", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        React.startTransition(() => action(data));
      }}
      {...props}
    >
      {children}
    </form>
  );
}

/** Inline, persistent message for the whole form. Moves focus to itself so screen readers announce it. */
export function FormMessage({ state }: { state: FormState }) {
  const [dismissed, setDismissed] = React.useState<FormState | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const message = state.formError ?? state.success;
  const visible = Boolean(message) && dismissed !== state;

  React.useEffect(() => {
    if (visible) ref.current?.focus();
  }, [visible, state]);

  if (!visible) return null;
  const isError = Boolean(state.formError);

  return (
    <Alert
      ref={ref}
      tabIndex={-1}
      role={isError ? "alert" : "status"}
      variant={isError ? "destructive" : "success"}
      className="flex items-start gap-3 pr-2"
    >
      {isError ? <AlertCircle aria-hidden /> : <CheckCircle2 aria-hidden />}
      <div className="flex-1">
        <AlertTitle>{message}</AlertTitle>
        {isError && state.formHint ? <AlertDescription>{state.formHint}</AlertDescription> : null}
      </div>
      <Button type="button" variant="ghost" className="min-h-12 min-w-12 px-0" onClick={() => setDismissed(state)}>
        <X aria-hidden />
        <span className="sr-only">Dismiss message</span>
      </Button>
    </Alert>
  );
}

type FieldProps = {
  name: string;
  label: string;
  hint?: string;
  error?: string;
};

function describedBy(name: string, hint?: string, error?: string) {
  return [hint ? `${name}-hint` : null, error ? `${name}-error` : null].filter(Boolean).join(" ") || undefined;
}

function FieldText({ name, hint, error }: Omit<FieldProps, "label">) {
  return (
    <>
      {hint ? (
        <p id={`${name}-hint`} className="text-base text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${name}-error`} className="flex items-start gap-2 text-base font-semibold text-destructive">
          <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0" />
          {error}
        </p>
      ) : null}
    </>
  );
}

// `id` defaults to the name; pass one when the same form appears more than once on a page.
export function TextField({ name, label, hint, error, id = name, ...props }: FieldProps & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <FieldText name={id} hint={hint} error={error} />
      <Input id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...props} />
    </div>
  );
}

export function TextAreaField({ name, label, hint, error, id = name, ...props }: FieldProps & React.ComponentProps<"textarea">) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <FieldText name={id} hint={hint} error={error} />
      <Textarea id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...props} />
    </div>
  );
}

export function CheckboxField({
  name,
  label,
  error,
  id = name,
  ...props
}: Omit<FieldProps, "label" | "hint"> & { label: React.ReactNode } & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        {/* The 28px box sits inside a 48px tall row; the whole label is clickable. */}
        <input
          id={id}
          name={name}
          type="checkbox"
          value="on"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-2.5 size-7 shrink-0 accent-primary"
          {...props}
        />
        <label htmlFor={id} className="min-h-12 py-2 text-lg leading-snug">
          {label}
        </label>
      </div>
      <FieldText name={id} error={error} />
    </div>
  );
}

export function SubmitButton({ pending, pendingLabel, children }: { pending: boolean; pendingLabel: string; children: React.ReactNode }) {
  return (
    <Button type="submit" size="full" disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
