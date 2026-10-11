import { NextRequest } from "next/server";
import { createSession, SESSION_COOKIE } from "@/server/auth/session";

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export interface CallOptions {
  method?: string;
  body?: unknown;
  rawBody?: BodyInit;
  token?: string | null;
  origin?: string | null;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  path?: string;
}

/** Invokes a Next.js route handler with a realistic request. */
export async function call(handler: Handler, opts: CallOptions = {}) {
  const method = opts.method ?? "GET";
  const headers = new Headers(opts.headers);
  if (opts.token) headers.set("cookie", `${SESSION_COOKIE}=${opts.token}`);
  if (opts.origin !== null && method !== "GET") headers.set("origin", opts.origin ?? "http://localhost:3000");
  let body: BodyInit | undefined = opts.rawBody;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  const req = new NextRequest(new URL(opts.path ?? "/api/test", "http://localhost:3000"), { method, headers, body });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, text, json: json as { ok: boolean; data?: any; error?: { code: string; message: string } } };
}

export async function tokenFor(userId: string) {
  return (await createSession(userId, { ip: "127.0.0.1", userAgent: "vitest" })).token;
}
