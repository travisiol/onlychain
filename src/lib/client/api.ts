/** Tiny fetch wrapper: JSON in, JSON out, the server's `error` as the throw. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown; form?: FormData }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body !== undefined || init?.form ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.form ?? (init?.body !== undefined ? JSON.stringify(init.body) : undefined),
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error ?? `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return body as T;
}
