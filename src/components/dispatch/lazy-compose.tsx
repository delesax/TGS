"use client";

import dynamic from "next/dynamic";

/**
 * The reply and edit forms, loaded only when someone opens one. Visitors who
 * only read the debate never download them (Sprint 4 performance quick win).
 */
export const LazyComposeForm = dynamic(() => import("./compose-form").then((m) => m.ComposeForm), {
  loading: () => <p className="text-base text-muted-foreground">Loading the form…</p>,
});
