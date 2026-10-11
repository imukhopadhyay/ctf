import { z } from "zod";
import { route } from "@/server/http/api";
import { getStandings } from "@/server/services/leaderboard";

export const GET = route<{ id: string }, undefined, { view?: "public" }>(
  { query: z.object({ view: z.literal("public").optional() }), rateLimit: { name: "leaderboard", limit: 120, window: 60, by: "ip" } },
  async ({ user, params, query }) => getStandings(user, params.id, { publicView: query.view === "public" }),
);
