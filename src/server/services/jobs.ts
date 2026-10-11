import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "../db";

export type JobType =
  | "achievements.evaluate"
  | "notify.first_blood"
  | "leaderboard.invalidate"
  | "competition.clock"
  | "instances.expire";

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown> = {},
  opts: { runAt?: Date; tx?: Tx } = {},
) {
  const client = opts.tx ?? db;
  await client.job.create({
    data: { type, payload: payload as Prisma.InputJsonValue, runAt: opts.runAt ?? new Date() },
  });
}

export interface ClaimedJob {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
}

/** Atomically claims due jobs. Safe with multiple workers (SKIP LOCKED). */
export async function claimJobs(limit = 10): Promise<ClaimedJob[]> {
  return db.$queryRaw<ClaimedJob[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), attempts = attempts + 1, "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "Job"
      WHERE (status = 'PENDING' AND "runAt" <= now())
         OR (status = 'RUNNING' AND "lockedAt" < now() - interval '10 minutes')
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, payload, attempts`;
}

export async function completeJob(id: string) {
  await db.job.update({ where: { id }, data: { status: "DONE", lockedAt: null } });
}

export async function failJob(id: string, attempts: number, error: string) {
  const final = attempts >= 5;
  await db.job.update({
    where: { id },
    data: {
      status: final ? "FAILED" : "PENDING",
      lastError: error.slice(0, 1000),
      lockedAt: null,
      runAt: new Date(Date.now() + Math.min(300, 2 ** attempts * 5) * 1000),
    },
  });
}
