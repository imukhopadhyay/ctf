import { route } from "@/server/http/api";
import { csvResponse, toCsv } from "@/server/http/csv";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { requireCompetitionPermission } from "@/server/services/access";
import { getStandings } from "@/server/services/leaderboard";

export const GET = route<{ id: string; kind: string }>({ auth: "required" }, async ({ user, params }) => {
  const { competition } = await requireCompetitionPermission(user, params.id, "reports.export");
  const stamp = new Date().toISOString().slice(0, 10);
  let csv: string;
  switch (params.kind) {
    case "standings": {
      const s = await getStandings(user, params.id);
      csv = toCsv(
        ["rank", "name", "subject", "points", "solves", "last_solve_at", ...["web", "crypto", "reverse", "forensics"].map((c) => `${c}_solves`)],
        s.rows.map((r) => [r.rank, r.name, r.subjectKey, r.points, r.solves, r.lastSolveAt, r.categorySolves.web ?? 0, r.categorySolves.crypto ?? 0, r.categorySolves.reverse ?? 0, r.categorySolves.forensics ?? 0]),
      );
      break;
    }
    case "submissions": {
      const rows = await db.submission.findMany({
        where: { competitionId: params.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true, result: true, subjectKey: true, user: { select: { username: true } }, team: { select: { name: true } }, challenge: { select: { title: true } } },
      });
      // Submitted values are never stored, so they cannot be exported.
      csv = toCsv(["id", "created_at", "challenge", "username", "team", "subject", "result"], rows.map((r) => [r.id, r.createdAt, r.challenge.title, r.user.username, r.team?.name ?? "", r.subjectKey, r.result]));
      break;
    }
    case "score-events": {
      const rows = await db.scoreEvent.findMany({
        where: { competitionId: params.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true, subjectKey: true, type: true, points: true, reason: true, challenge: { select: { title: true } }, createdBy: { select: { username: true } } },
      });
      csv = toCsv(["id", "created_at", "subject", "type", "points", "challenge", "reason", "created_by"], rows.map((r) => [r.id, r.createdAt, r.subjectKey, r.type, r.points, r.challenge?.title ?? "", r.reason, r.createdBy?.username ?? "system"]));
      break;
    }
    case "challenges": {
      const rows = await db.challenge.findMany({
        where: { competitionId: params.id },
        select: { title: true, slug: true, status: true, difficulty: true, points: true, category: { select: { name: true } }, _count: { select: { solves: true, submissions: true } } },
      });
      csv = toCsv(["title", "slug", "category", "difficulty", "status", "points", "solves", "submissions"], rows.map((r) => [r.title, r.slug, r.category.name, r.difficulty, r.status, r.points, r._count.solves, r._count.submissions]));
      break;
    }
    default:
      throw notFound("Export");
  }
  await audit({ actorId: user!.id, action: "report.export", targetType: "competition", targetId: params.id, competitionId: params.id, metadata: { kind: params.kind } });
  return csvResponse(`${competition.slug}-${params.kind}-${stamp}.csv`, csv);
});
