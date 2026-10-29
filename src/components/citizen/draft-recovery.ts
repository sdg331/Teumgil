"use client";

import type { DraftContent } from "../../lib/contracts";

type Recovery = {
  content: DraftContent;
  version: number;
  pending: Promise<number> | null;
};
const recoveries = new Map<string, Recovery>();
let listening = false;

/** Unsaved input lives only in this tab's memory and is keyed by the authenticated owner. */
export function preserveDraft(
  owner: string,
  content: DraftContent,
  version: number,
  pending: Promise<number> | null = null,
) {
  if (!owner) return;
  recoveries.set(owner, {
    content: structuredClone(content),
    version,
    pending,
  });
  if (!listening) {
    window.addEventListener("beforeunload", (event) => {
      if (recoveries.size > 0) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    listening = true;
  }
}

export function recoveredDraft(owner: string) {
  return recoveries.get(owner);
}
export function forgetDraft(owner: string) {
  recoveries.delete(owner);
}

export function confirmDraft(
  owner: string,
  savedContent: DraftContent,
  version: number,
) {
  const entry = recoveries.get(owner);
  if (!entry) return;
  if (JSON.stringify(entry.content) === JSON.stringify(savedContent))
    recoveries.delete(owner);
  else entry.version = version;
}

export function pendingDraft(owner: string, pending: Promise<number> | null) {
  const entry = recoveries.get(owner);
  if (entry) entry.pending = pending;
}
