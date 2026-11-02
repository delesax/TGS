"use client";

import * as React from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice.catch(() => null);
          setPrompt(null);
        }}
      >
        <Download aria-hidden /> Install the app
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="min-w-12 px-0"
        onClick={() => {
          setPrompt(null);
          try {
            window.localStorage.setItem(DISMISSED_KEY, "1");
          } catch {}
        }}
      >
        <X aria-hidden />
        <span className="sr-only">Do not offer to install the app again</span>
      </Button>
    </div>
  );
}
