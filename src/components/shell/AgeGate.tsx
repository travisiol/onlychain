"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { MarkImg } from "@/components/Logo";
import { site } from "@/lib/site";

/**
 * The 18+ door, once per browser. Stored in localStorage (a convenience,
 * not a proof); the sign-in message repeats the affirmation for wallets.
 */
const KEY = "onlychain:age-ok";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true; // storage blocked: do not wall the page off forever
  }
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function accept() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn());
}

export function AgeGate() {
  const ok = useSyncExternalStore(subscribe, read, () => true);
  if (ok) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="age-title">
      <div className="card w-full max-w-[420px] p-7 text-center shadow-[var(--shadow-pop)] fade-up">
        <MarkImg size={72} className="mx-auto" />
        <h2 id="age-title" className="mt-4 text-[20px] font-bold">
          You must be {site.minAge} or older
        </h2>
        <p className="mt-2 text-[14px] text-ink-2">
          {site.name} hosts creator content that may be intended for adults. By continuing you confirm that you are at least {site.minAge} years old and that viewing such content is legal where you are.
        </p>
        <button type="button" className="btn btn-accent btn-lg btn-block mt-6" onClick={accept}>
          I am {site.minAge} or older — enter
        </button>
        <Link href="https://www.google.com" className="mt-3 inline-block text-[13px] text-ink-2 hover:text-ink">
          Leave
        </Link>
      </div>
    </div>
  );
}
