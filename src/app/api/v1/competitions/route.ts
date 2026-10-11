import { z } from "zod";
import { route } from "@/server/http/api";
import { competitionInputSchema, createCompetition, listCompetitions } from "@/server/services/competitions";
import { LIMITS } from "@/server/ratelimit";

export const GET = route(
  { query: z.object({ includeDrafts: z.enum(["true", "false"]).optional() }) },
  async ({ user, query }) => listCompetitions(user, { includeStaffDrafts: query.includeDrafts === "true" }),
);

export const POST = route(
  { auth: "required", body: competitionInputSchema, rateLimit: { name: "comp.create", ...LIMITS.mutation } },
  async ({ user, body }) => createCompetition(user, body),
);
