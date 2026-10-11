import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { clockTransition } from "../domain/competition-state";
import { claimJobs, completeJob, failJob, type ClaimedJob } from "./jobs";
import { evaluateAchievements } from "./achievements";
import { invalidateLeaderboard } from "./leaderboard";
import { notifyUsers } from "./notifications";
import { expireInstances } from "./instances";

async function handle(job: ClaimedJob) {
  const p = job.payload as Record<string, string>;
  switch (job.type) {
    case "achievements.evaluate":
      await evaluateAchievements({ competitionId: p.competitionId!, subjectKey: p.subjectKey!, userId: p.userId! });
      return;
    case "notify.first_blood": {
      const solve = await db.solve.findUnique({
        where: { id: p.solveId! },
        include: { challenge: { select: { title: true, competition: { select: { slug: true, name: true } } } }, user: { select: { displayName: true } } },
      });
      if (!solve) return;
      const recipients = solve.teamId
        ? (await db.teamMembership.findMany({ where: { teamId: solve.teamId }, select: { userId: true } })).map((m) => m.userId)
        : [solve.userId];
      const staff = (await db.competitionStaff.findMany({ where: { competitionId: solve.competitionId }, select: { userId: true } })).map((s) => s.userId);
      await notifyUsers([...recipients, ...staff], {
        type: "first_blood",
        title: `🩸 First blood on "${solve.challenge.title}" by ${solve.user.displayName}`,
        link: `/competitions/${solve.challenge.competition.slug}/leaderboard`,
      });
      return;
    }
    case "leaderboard.invalidate":
      await invalidateLeaderboard(p.competitionId!);
      return;
    case "competition.clock":
      await runCompetitionClock();
      return;
    case "instances.expire":
      await expireInstances();
      return;
    default:
      throw new Error(`Unknown job type ${job.type}`);
  }
}

/** Processes up to `limit` due jobs. Returns the number processed. */
export async function processJobs(limit = 10): Promise<number> {
  const jobs = await claimJobs(limit);
  for (const job of jobs) {
    try {
      await handle(job);
      await completeJob(job.id);
    } catch (e) {
      console.error(`[worker] job ${job.type} ${job.id} failed:`, (e as Error).message);
      await failJob(job.id, job.attempts, (e as Error).message);
    }
  }
  return jobs.length;
}

/** Moves SCHEDULED→ACTIVE→COMPLETED according to configured times. */
export async function runCompetitionClock(now = new Date()) {
  const candidates = await db.competition.findMany({
    where: { status: { in: ["SCHEDULED", "ACTIVE"] } },
    select: { id: true, status: true, startsAt: true, endsAt: true },
  });
  let changed = 0;
  for (const c of candidates) {
    const next = clockTransition(c, now);
    if (!next) continue;
    // Conditional update guards against racing with a manual transition.
    const res = await db.competition.updateMany({ where: { id: c.id, status: c.status }, data: { status: next } });
    if (res.count === 1) {
      changed++;
      await audit({ actorId: null, action: "competition.status.auto", targetType: "competition", targetId: c.id, competitionId: c.id, metadata: { from: c.status, to: next } });
      await invalidateLeaderboard(c.id);
    }
  }
  return changed;
}

/** Periodic housekeeping. */
export async function housekeeping(now = new Date()) {
  const [sessions, jobs] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.job.deleteMany({ where: { status: "DONE", updatedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } } }),
  ]);
  return { sessions: sessions.count, jobs: jobs.count };
}
