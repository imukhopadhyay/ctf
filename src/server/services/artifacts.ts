import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { AppError, conflict, isUniqueViolation, notFound } from "../errors";
import { audit, securityEvent } from "../audit";
import { inspectFile } from "../domain/file-inspect";
import { sanitizeFilename } from "../domain/filename";
import { artifactStore } from "../storage";
import { rateLimit, LIMITS } from "../ratelimit";
import { assertUser, competitionCan, requireCompetitionPermission, type Actor } from "./access";
import { loadPlayableChallenge } from "./challenges";

export interface UploadInput {
  filename: string;
  data: Buffer;
  description?: string;
  visible?: boolean;
}

/** Stores an artifact after size checks, sanitization and content inspection. */
export async function storeArtifact(challengeId: string, input: UploadInput, uploadedById: string | null) {
  const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
  if (input.data.length === 0) throw new AppError("VALIDATION_FAILED", "File is empty.");
  if (input.data.length > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE", `File exceeds the ${env().MAX_UPLOAD_MB} MB limit.`);
  const filename = sanitizeFilename(input.filename);
  const inspection = inspectFile(input.data);
  if (inspection.blockingProblems.length > 0) {
    await securityEvent({
      type: "UNSAFE_UPLOAD_REJECTED",
      severity: "MEDIUM",
      userId: uploadedById,
      details: { challengeId, filename, problems: inspection.blockingProblems.slice(0, 10) },
    });
    throw new AppError("VALIDATION_FAILED", "The file failed safety inspection.", inspection.blockingProblems.slice(0, 20).map((message) => ({ path: "file", message })));
  }
  const stored = await artifactStore().put(input.data);
  try {
    return await db.challengeArtifact.create({
      data: {
        challengeId,
        filename,
        storageKey: stored.key,
        sha256: stored.sha256,
        sizeBytes: stored.size,
        mimeType: inspection.mimeType,
        detectedType: inspection.detectedType,
        metadata: inspection.metadata as Prisma.InputJsonValue,
        description: input.description?.slice(0, 2000) ?? "",
        visible: input.visible ?? true,
        uploadedById,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict(`An artifact named "${filename}" already exists on this challenge.`);
    throw e;
  }
}

export async function uploadArtifact(actor: Actor | null, challengeId: string, input: UploadInput, meta: { ip: string | null }) {
  assertUser(actor);
  const challenge = await db.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge) throw notFound("Challenge");
  const { user } = await requireCompetitionPermission(actor, challenge.competitionId, "challenge.manage");
  const rl = await rateLimit(`upload:${user.id}`, LIMITS.upload.limit, LIMITS.upload.window);
  if (!rl.allowed) throw new AppError("RATE_LIMITED", "Too many uploads.", undefined, rl.retryAfterSeconds);
  const artifact = await storeArtifact(challengeId, input, user.id);
  await audit({
    actorId: user.id,
    action: "artifact.upload",
    targetType: "artifact",
    targetId: artifact.id,
    competitionId: challenge.competitionId,
    metadata: { challengeId, filename: artifact.filename, sha256: artifact.sha256, size: artifact.sizeBytes },
    ip: meta.ip,
  });
  return artifact;
}

export async function updateArtifact(actor: Actor | null, artifactId: string, patch: { visible?: boolean; description?: string }) {
  const artifact = await db.challengeArtifact.findUnique({ where: { id: artifactId }, include: { challenge: true } });
  if (!artifact) throw notFound("Artifact");
  const { user } = await requireCompetitionPermission(actor, artifact.challenge.competitionId, "challenge.manage");
  const updated = await db.challengeArtifact.update({
    where: { id: artifactId },
    data: { visible: patch.visible, description: patch.description?.slice(0, 2000) },
  });
  await audit({ actorId: user.id, action: "artifact.update", targetType: "artifact", targetId: artifactId, competitionId: artifact.challenge.competitionId, metadata: patch });
  return updated;
}

/** Removes the artifact record. The immutable blob is retained (it may be shared or needed as evidence). */
export async function deleteArtifact(actor: Actor | null, artifactId: string) {
  const artifact = await db.challengeArtifact.findUnique({ where: { id: artifactId }, include: { challenge: true } });
  if (!artifact) throw notFound("Artifact");
  const { user } = await requireCompetitionPermission(actor, artifact.challenge.competitionId, "challenge.manage");
  await db.challengeArtifact.delete({ where: { id: artifactId } });
  await audit({ actorId: user.id, action: "artifact.delete", targetType: "artifact", targetId: artifactId, competitionId: artifact.challenge.competitionId, metadata: { filename: artifact.filename, sha256: artifact.sha256 } });
}

/** Authorizes a download. Participants may only fetch visible artifacts of challenges they can play. */
export async function authorizeArtifactDownload(actor: Actor | null, artifactId: string, meta: { ip: string | null }) {
  assertUser(actor);
  const artifact = await db.challengeArtifact.findUnique({
    where: { id: artifactId },
    include: { challenge: { select: { id: true, competitionId: true } } },
  });
  if (!artifact) throw notFound("Artifact");
  const isStaff = await competitionCan(actor, artifact.challenge.competitionId, "competition.view_staff");
  if (!isStaff) {
    if (!artifact.visible) throw notFound("Artifact");
    // Throws 404/403 if the challenge is not visible/unlocked for this user.
    await loadPlayableChallenge(actor, artifact.challenge.competitionId, artifact.challenge.id);
  }
  const rl = await rateLimit(`dl:${actor.id}`, LIMITS.download.limit, LIMITS.download.window);
  if (!rl.allowed) {
    await securityEvent({ type: "RATE_LIMIT", userId: actor.id, ip: meta.ip, details: { limiter: "download" } });
    throw new AppError("RATE_LIMITED", "Too many downloads.", undefined, rl.retryAfterSeconds);
  }
  return artifact;
}

export async function getArtifactMetadata(actor: Actor | null, artifactId: string) {
  const artifact = await authorizeArtifactDownload(actor, artifactId, { ip: null });
  const challenge = await db.challenge.findUniqueOrThrow({
    where: { id: artifact.challengeId },
    select: { id: true, title: true, competition: { select: { slug: true, name: true } } },
  });
  const { storageKey: _k, uploadedById: _u, ...safe } = artifact;
  return { artifact: safe, challenge };
}
