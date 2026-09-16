"use client";

import { useSyncExternalStore } from "react";

/**
 * A shared clock for "3m ago" labels: one interval for the whole page,
 * read through useSyncExternalStore so nothing temporal is rendered on the
 * server (snapshot 0 there) and no effect calls setState.
 */
let cached = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!timer) {
    cached = Date.now();
    timer = setInterval(() => {
      cached = Date.now();
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const snapshot = () => {
  if (cached === 0) cached = Date.now();
  return cached;
};

/** Milliseconds now on the client; 0 during server rendering. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
