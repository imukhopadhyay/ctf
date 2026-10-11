import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";
import { hashIp } from "./crypto";

const SECRET_KEYS = /pass(word)?|token|secret|flag|cookie|session|digest|invite/i;

/** Remove anything that looks like a secret before persisting audit metadata. */
export function scrubMetadata(meta: Record<string, unknown> | undefined): Prisma.InputJsonValue {
  if (!meta) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET_KEYS.test(k)) {
      out[k] = "[redacted]";
    } else if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      out[k] = scrubMetadata(v as Record<string, unknown>);
    } else {
      out[k] = v instanceof Date ? v.toISOString() : v;
    }
  }
  return out as Prisma.InputJsonValue;
}

export interface AuditInput {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  competitionId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export async function audit(input: AuditInput, tx: Tx = db) {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      competitionId: input.competitionId ?? null,
      metadata: scrubMetadata(input.metadata),
      ipHash: hashIp(input.ip),
    },
  });
}

export type SecurityEventType =
  | "RATE_LIMIT"
  | "LOGIN_FAILURE"
  | "ACCOUNT_LOCKED"
  | "ACCESS_DENIED"
  | "CSRF_REJECTED"
  | "FLAG_SHARING_SUSPECTED"
  | "SUBMISSION_LIMIT"
  | "UNSAFE_UPLOAD_REJECTED"
  | "INSTANCE_FAILURE";

export async function securityEvent(input: {
  type: SecurityEventType;
  severity?: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  userId?: string | null;
  competitionId?: string | null;
  ip?: string | null;
  details?: Record<string, unknown>;
}) {
  try {
    await db.securityEvent.create({
      data: {
        type: input.type,
        severity: input.severity ?? "LOW",
        userId: input.userId ?? null,
        competitionId: input.competitionId ?? null,
        ipHash: hashIp(input.ip),
        details: scrubMetadata(input.details),
      },
    });
  } catch (e) {
    console.error("[security-event] failed to record", input.type, (e as Error).message);
  }
}
