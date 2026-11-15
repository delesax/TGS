"use client";

import * as React from "react";
import { Download, X } from "lucide-react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISSED_KEY = "tgs-install-dismissed";

/**
 * Registers the service worker (production builds only) and, when the browser
 * says the app can be installed, offers a small "Install the app" button in
 * the footer. Never a pop-up; once dismissed it stays away on this device.
 */
export function PwaSupport() {
  const [prompt, setPrompt] = React.useState<InstallPromptEvent | null>(null);

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // The site works without it; only offline support is lost.
      });
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      try {
        if (window.localStorage.getItem(DISMISSED_KEY)) return;
      } catch {}
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!prompt) return null;
  // A small pill in the bottom-left corner, out of the page flow (position: fixed), so it adds no height and causes
  // no layout shift; it sits below the header menu and covers only a corner of the viewport. Same two actions as before.
  return (
    <div
      role="region"
      aria-label="Install the app"
      className="fixed bottom-3 left-3 z-30 flex items-center gap-0.5 rounded-full border border-hairline bg-raised py-0.5 pl-1 pr-0.5 shadow-[var(--shadow-raised)]"
    >
      <button
        type="button"
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice.catch(() => null);
          setPrompt(null);
        }}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold text-foreground transition-colors duration-200 hover:bg-muted motion-reduce:transition-none"
      >
        <Download aria-hidden className="size-4" /> Install the app
      </button>
      <button
        type="button"
        onClick={() => {
          setPrompt(null);
          try {
            window.localStorage.setItem(DISMISSED_KEY, "1");
          } catch {}
        }}
        className="grid size-11 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground motion-reduce:transition-none"
      >
        <X aria-hidden className="size-4" />
        <span className="sr-only">Do not offer to install the app again</span>
      </button>
    </div>
  );
}
