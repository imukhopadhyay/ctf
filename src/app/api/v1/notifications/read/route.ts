import { z } from "zod";
import { route } from "@/server/http/api";
import { markNotificationsRead } from "@/server/services/notifications";

export const POST = route(
  { auth: "required", body: z.object({ ids: z.union([z.literal("all"), z.array(z.string().cuid()).max(100)]) }) },
  async ({ user, body }) => {
    await markNotificationsRead(user, body.ids);
    return { ok: true };
  },
);
