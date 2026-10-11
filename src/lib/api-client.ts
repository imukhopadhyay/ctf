"use client";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** Same-origin JSON API client. All authorization happens server-side. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? "GET",
    credentials: "same-origin",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let payload: { ok?: boolean; data?: T; error?: { code: string; message: string; details?: { path: string; message: string }[] } } = {};
  try {
    payload = await res.json();
  } catch {
    // non-JSON response
  }
  if (!res.ok && !(payload.ok && payload.data !== undefined)) {
    throw new ApiError(res.status, payload.error?.code ?? "ERROR", payload.error?.message ?? `Request failed (${res.status})`, payload.error?.details);
  }
  return payload.data as T;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const details = e.details?.map((d) => d.message).filter(Boolean) ?? [];
    return details.length ? `${e.message} ${details.join(" ")}` : e.message;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}
