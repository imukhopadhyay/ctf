import { z } from "zod";
import { route } from "@/server/http/api";
import { registerForCompetition, withdrawRegistration } from "@/server/services/competitions";

export const POST = route<{ id: string }, { inviteCode?: string }>(
  { auth: "required", body: z.object({ inviteCode: z.string().max(64).optional() }), rateLimit: { name: "comp.register", limit: 20, window: 600 } },
  async ({ user, params, body }) => {
    const reg = await registerForCompetition(user, params.id, body.inviteCode);
    return { status: reg.status };
  },
);

export const DELETE = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => {
  await withdrawRegistration(user, params.id);
  return { withdrawn: true };
});
