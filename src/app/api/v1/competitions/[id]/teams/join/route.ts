import { z } from "zod";
import { route } from "@/server/http/api";
import { joinTeam } from "@/server/services/teams";

export const POST = route<{ id: string }, { inviteCode: string }>(
  { auth: "required", body: z.object({ inviteCode: z.string().max(32) }) },
  async ({ user, params, body, ip }) => joinTeam(user, params.id, body.inviteCode, { ip }),
);
