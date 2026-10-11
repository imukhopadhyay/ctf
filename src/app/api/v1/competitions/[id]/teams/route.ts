import { z } from "zod";
import { route } from "@/server/http/api";
import { createTeam, listTeams } from "@/server/services/teams";

export const GET = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => listTeams(user, params.id));

export const POST = route<{ id: string }, { name: string }>(
  { auth: "required", body: z.object({ name: z.string().max(80) }), rateLimit: { name: "team.create", limit: 10, window: 600 } },
  async ({ user, params, body }) => {
    const t = await createTeam(user, params.id, body.name);
    return { id: t.id, name: t.name, inviteCode: t.inviteCode };
  },
);
