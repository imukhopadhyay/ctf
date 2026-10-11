import "server-only";
import { z } from "zod";
import { db } from "../db";
import { env } from "../env";
import { badRequest, notFound, AppError } from "../errors";
import { audit } from "../audit";
import { flagDigest, matchStaticFlag, normalizeFlag, MAX_FLAG_LENGTH } from "../domain/flag-match";
import { rateLimit } from "../ratelimit";
import { requireCompetitionPermission, type Actor } from "./access";

const optionalDate = z
  .union([z.coerce.date(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

export const flagInputSchema = z
  .object({
    type: z.enum(["STATIC", "INSTANCE"]).default("STATIC"),
    value: z.string().max(MAX_FLAG_LENGTH).optional(),
    label: z.string().trim().min(1).max(60).default("flag"),
    caseSensitive: z.boolean().default(true),
    normalizeWhitespace: z.boolean().default(false),
    expiresAt: optionalDate,
  })
  .superRefine((v, ctx) => {
    if (v.type === "STATIC" && (!v.value || v.value.trim().length < 4))
      ctx.addIssue({ code: "custom", path: ["value"], message: "Static flags must be at least 4 characters." });
  });

async function loadForManage(actor: Actor | null, challengeId: string) {
  const challenge = await db.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge) throw notFound("Challenge");
  const { user } = await requireCompetitionPermission(actor, challenge.competitionId, "challenge.manage");
  return { user, challenge };
}

/** Public projection of a flag configuration — never includes the digest. */
const flagMeta = {
  id: true,
  type: true,
  label: true,
  caseSensitive: true,
  normalizeWhitespace: true,
  active: true,
  expiresAt: true,
  keyVersion: true,
  createdAt: true,
  rotatedAt: true,
} as const;

export async function addFlag(actor: Actor | null, challengeId: string, input: z.input<typeof flagInputSchema>) {
  const { user, challenge } = await loadForManage(actor, challengeId);
  const data = flagInputSchema.parse(input);
  if (data.type === "INSTANCE" && challenge.accessMethod !== "INSTANCE")
    throw badRequest("Instance flags can only be used with instance-based challenges.");
  const digest =
    data.type === "STATIC" ? flagDigest(env().FLAG_PEPPER, normalizeFlag(data.value!, data), 1) : null;
  const flag = await db.$transaction(async (tx) => {
    const f = await tx.flagConfiguration.create({
      data: {
        challengeId,
        type: data.type,
        label: data.label,
        caseSensitive: data.caseSensitive,
        normalizeWhitespace: data.normalizeWhitespace,
        expiresAt: data.expiresAt,
        digest,
      },
      select: flagMeta,
    });
    // Changing flags invalidates the previous test result.
    await tx.challenge.update({ where: { id: challengeId }, data: { flagsTestedAt: null } });
    await audit({ actorId: user.id, action: "flag.create", targetType: "challenge", targetId: challengeId, competitionId: challenge.competitionId, metadata: { flagId: f.id, type: f.type, label: f.label } }, tx);
    return f;
  });
  return flag;
}

export async function rotateFlag(actor: Actor | null, challengeId: string, flagId: string, newValue: string) {
  const { user, challenge } = await loadForManage(actor, challengeId);
  const flag = await db.flagConfiguration.findFirst({ where: { id: flagId, challengeId } });
  if (!flag) throw notFound("Flag");
  if (flag.type !== "STATIC") throw badRequest("Instance flags rotate automatically with each instance.");
  if (newValue.trim().length < 4 || newValue.length > MAX_FLAG_LENGTH) throw badRequest("Flag must be 4–512 characters.");
  const keyVersion = flag.keyVersion + 1;
  const updated = await db.$transaction(async (tx) => {
    const f = await tx.flagConfiguration.update({
      where: { id: flagId },
      data: { digest: flagDigest(env().FLAG_PEPPER, normalizeFlag(newValue, flag), keyVersion), keyVersion, rotatedAt: new Date() },
      select: flagMeta,
    });
    await tx.challenge.update({ where: { id: challengeId }, data: { flagsTestedAt: null } });
    await audit({ actorId: user.id, action: "flag.rotate", targetType: "challenge", targetId: challengeId, competitionId: challenge.competitionId, metadata: { flagId, keyVersion } }, tx);
    return f;
  });
  return updated;
}

export async function setFlagActive(actor: Actor | null, challengeId: string, flagId: string, active: boolean) {
  const { user, challenge } = await loadForManage(actor, challengeId);
  const res = await db.flagConfiguration.updateMany({ where: { id: flagId, challengeId }, data: { active } });
  if (res.count === 0) throw notFound("Flag");
  await audit({ actorId: user.id, action: active ? "flag.activate" : "flag.deactivate", targetType: "challenge", targetId: challengeId, competitionId: challenge.competitionId, metadata: { flagId } });
}

/**
 * Organizer flag tester. Checks a candidate against the configured static
 * flags without creating submissions or score events.
 */
export async function testFlag(actor: Actor | null, challengeId: string, candidate: string) {
  const { user, challenge } = await loadForManage(actor, challengeId);
  const rl = await rateLimit(`flagtest:${user.id}`, 30, 60);
  if (!rl.allowed) throw new AppError("RATE_LIMITED", "Too many flag tests.", undefined, rl.retryAfterSeconds);
  if (candidate.length > MAX_FLAG_LENGTH) throw badRequest("Flag too long.");
  const flags = await db.flagConfiguration.findMany({ where: { challengeId, type: "STATIC" } });
  const matchedId = matchStaticFlag(
    env().FLAG_PEPPER,
    candidate,
    flags.map((f) => ({ ...f, digest: f.digest ?? "" })),
    new Date(),
  );
  const matched = flags.find((f) => f.id === matchedId);
  if (matched) await db.challenge.update({ where: { id: challengeId }, data: { flagsTestedAt: new Date() } });
  await audit({ actorId: user.id, action: "flag.test", targetType: "challenge", targetId: challengeId, competitionId: challenge.competitionId, metadata: { matched: !!matched } });
  return { matched: !!matched, label: matched?.label ?? null };
}
