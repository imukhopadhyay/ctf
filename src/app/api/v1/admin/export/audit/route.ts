import { route } from "@/server/http/api";
import { csvResponse, toCsv } from "@/server/http/csv";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { requirePlatform } from "@/server/services/access";

export const GET = route({ auth: "required" }, async ({ user }) => {
  await requirePlatform(user, "platform.reports.export");
  const rows = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50_000,
    include: { actor: { select: { username: true } } },
  });
  await audit({ actorId: user!.id, action: "report.export", metadata: { kind: "audit" } });
  return csvResponse(
    `audit-${new Date().toISOString().slice(0, 10)}.csv`,
    toCsv(["id", "created_at", "actor", "action", "target_type", "target_id", "competition_id", "metadata"], rows.map((r) => [r.id, r.createdAt, r.actor?.username ?? "system", r.action, r.targetType, r.targetId, r.competitionId, r.metadata])),
  );
});
