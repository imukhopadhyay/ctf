import { z } from "zod";
import { route } from "@/server/http/api";
import { setTeamHidden } from "@/server/services/teams";

export const PATCH = route<{ id: string; teamId: string }, { hidden: boolean; reason: string }>(
  { auth: "required", body: z.object({ hidden: z.boolean(), reason: z.string().trim().min(3).max(500) }) },
  async ({ user, params, body }) => {
    await setTeamHidden(user, params.id, params.teamId, body.hidden, body.reason);
    return { hidden: body.hidden };
  },
);
