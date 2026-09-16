"use client";

import { useSyncExternalStore } from "react";

/**
 * Read a `?param` without `useSearchParams` (which bails the page out of
 * static rendering and, in dev, does not hydrate until the first click).
 * Subscribes to popstate and to our own event fired after pushState.
 */
const EVENT = "onlychain:locationchange";
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onChange = () => fn();
  window.addEventListener("popstate", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useLocationSearch(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(key),
    () => null,
  );
}

export function setLocationSearch(key: string, value: string | null, replace = true): void {
  const url = new URL(window.location.href);
  if (value === null || value === "") url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  if (replace) history.replaceState(history.state, "", url);
  else history.pushState(history.state, "", url);
  window.dispatchEvent(new Event(EVENT));
}
