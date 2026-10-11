import { z } from "zod";
import { route } from "@/server/http/api";
import { transferCaptain } from "@/server/services/teams";

export const POST = route<{ id: string }, { userId: string }>(
  { auth: "required", body: z.object({ userId: z.string().cuid() }) },
  async ({ user, params, body }) => {
    await transferCaptain(user, params.id, body.userId);
    return { transferred: true };
  },
);
