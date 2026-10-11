/**
 * CyberQuest background worker.
 * Run with: npm run worker  (uses the react-server export condition so that
 * the shared server-only service modules can be imported outside Next.js).
 */
import { processJobs, runCompetitionClock, housekeeping } from "../../src/server/services/worker-tasks";
import { expireInstances } from "../../src/server/services/instances";
import { db } from "../../src/server/db";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 30_000);
let stopping = false;

async function loop() {
  let lastTick = 0;
  console.log(`[worker] started (poll ${POLL_MS}ms, tick ${TICK_MS}ms)`);
  while (!stopping) {
    try {
      const processed = await processJobs(20);
      if (Date.now() - lastTick >= TICK_MS) {
        lastTick = Date.now();
        const changed = await runCompetitionClock();
        const expired = await expireInstances();
        const hk = await housekeeping();
        if (changed || expired || hk.sessions) console.log(`[worker] tick: ${changed} status change(s), ${expired} instance(s) expired, ${hk.sessions} session(s) purged`);
      }
      if (processed === 0) await new Promise((r) => setTimeout(r, POLL_MS));
    } catch (e) {
      console.error("[worker] loop error:", (e as Error).message);
      await new Promise((r) => setTimeout(r, POLL_MS * 2));
    }
  }
  await db.$disconnect();
  console.log("[worker] stopped");
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopping = true;
  });
}
void loop();
