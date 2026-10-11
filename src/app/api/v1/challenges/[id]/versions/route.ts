import { route } from "@/server/http/api";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import { requireCompetitionPermission } from "@/server/services/access";

export const GET = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => {
  const c = await db.challenge.findUnique({ where: { id: params.id }, select: { competitionId: true } });
  if (!c) throw notFound("Challenge");
  await requireCompetitionPermission(user, c.competitionId, "competition.view_staff");
  return db.challengeVersion.findMany({ where: { challengeId: params.id }, orderBy: { version: "desc" } });
});
