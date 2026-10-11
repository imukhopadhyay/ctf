import { z } from "zod";
import { route } from "@/server/http/api";
import { setInviteCode } from "@/server/services/competitions";

export const POST = route<{ id: string }, { code: string | null }>(
  { auth: "required", body: z.object({ code: z.string().max(64).nullable() }) },
  async ({ user, params, body }) => {
    await setInviteCode(user, params.id, body.code);
    return { set: body.code !== null };
  },
);
