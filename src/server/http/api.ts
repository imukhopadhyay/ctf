import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType, type ZodTypeDef } from "zod";
import { AppError, unauthenticated } from "../errors";
import { env } from "../env";
import { SESSION_COOKIE, validateSessionToken, type SessionUser } from "../auth/session";
import { rateLimit } from "../ratelimit";
import { securityEvent } from "../audit";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}
export interface ApiFailure {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

export function clientIp(req: NextRequest): string | null {
  if (env().TRUST_PROXY) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim().slice(0, 64);
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim().slice(0, 64);
  }
  return "direct";
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated mutations: the request must come from
 * our own origin (Origin header, or Sec-Fetch-Site when Origin is absent).
 * Combined with SameSite=Lax cookies and JSON-only bodies this blocks
 * cross-site form posts.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(env().APP_URL).origin, req.nextUrl.origin]);
  if (origin) return allowed.has(origin);
  const site = req.headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
}

export interface RouteContext<P, B, Q> {
  req: NextRequest;
  user: SessionUser | null;
  ip: string | null;
  params: P;
  body: B;
  query: Q;
}

export interface RouteOptions<B, Q> {
  auth?: "required" | "optional";
  body?: ZodType<B, ZodTypeDef, unknown>;
  query?: ZodType<Q, ZodTypeDef, unknown>;
  /** Raw body handling (e.g. multipart uploads) — skips JSON parsing. */
  rawBody?: boolean;
  rateLimit?: { name: string; limit: number; window: number; by?: "user" | "ip" };
  maxJsonBytes?: number;
}

type Handler<P, B, Q> = (ctx: RouteContext<P, B, Q>) => Promise<unknown>;

export function json<T>(data: T, init?: { status?: number; meta?: Record<string, unknown> }) {
  const body: ApiSuccess<T> = { ok: true, data, ...(init?.meta ? { meta: init.meta } : {}) };
  return NextResponse.json(body, { status: init?.status ?? 200, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(err: AppError) {
  const body: ApiFailure = {
    ok: false,
    error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) },
  };
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (err.retryAfterSeconds) headers["Retry-After"] = String(err.retryAfterSeconds);
  return NextResponse.json(body, { status: err.status, headers });
}

export function route<P = Record<string, string>, B = undefined, Q = undefined>(
  options: RouteOptions<B, Q>,
  handler: Handler<P, B, Q>,
) {
  return async (req: NextRequest, segment: { params: Promise<P> }): Promise<Response> => {
    const ip = clientIp(req);
    try {
      if (!SAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
        await securityEvent({ type: "CSRF_REJECTED", severity: "MEDIUM", ip, details: { path: req.nextUrl.pathname } });
        throw new AppError("FORBIDDEN", "Cross-origin request rejected");
      }

      const user = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
      if (options.auth === "required" && !user) throw unauthenticated();

      if (options.rateLimit) {
        const rl = options.rateLimit;
        const who = rl.by === "ip" || !user ? `ip:${ip}` : `u:${user.id}`;
        const res = await rateLimit(`${rl.name}:${who}`, rl.limit, rl.window);
        if (!res.allowed) {
          await securityEvent({
            type: "RATE_LIMIT",
            userId: user?.id,
            ip,
            details: { limiter: rl.name, path: req.nextUrl.pathname },
          });
          throw new AppError("RATE_LIMITED", "Too many requests. Please slow down.", undefined, res.retryAfterSeconds);
        }
      }

      let body = undefined as B;
      if (options.body && !options.rawBody) {
        const ct = req.headers.get("content-type") ?? "";
        if (!ct.toLowerCase().startsWith("application/json"))
          throw new AppError("BAD_REQUEST", "Content-Type must be application/json");
        const text = await req.text();
        if (text.length > (options.maxJsonBytes ?? 256 * 1024))
          throw new AppError("PAYLOAD_TOO_LARGE", "Request body too large");
        let raw: unknown;
        try {
          raw = text.length ? JSON.parse(text) : {};
        } catch {
          throw new AppError("BAD_REQUEST", "Malformed JSON body");
        }
        body = options.body.parse(raw);
      }

      let query = undefined as Q;
      if (options.query) {
        query = options.query.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
      }

      const params = (await segment.params) ?? ({} as P);
      const result = await handler({ req, user, ip, params, body, query });
      if (result instanceof Response) return result;
      return json(result ?? null);
    } catch (e) {
      if (e instanceof AppError) return errorResponse(e);
      if (e instanceof ZodError) {
        return errorResponse(
          new AppError(
            "VALIDATION_FAILED",
            "Request validation failed",
            e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          ),
        );
      }
      console.error("[api] unhandled error", req.method, req.nextUrl.pathname, e);
      return errorResponse(new AppError("INTERNAL", "An unexpected error occurred"));
    }
  };
}
