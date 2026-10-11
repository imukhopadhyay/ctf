import { z } from "zod";
import { route } from "@/server/http/api";
import { listNotifications } from "@/server/services/notifications";

export const GET = route(
  { auth: "required", query: z.object({ unread: z.enum(["true", "false"]).optional() }) },
  async ({ user, query }) => listNotifications(user, { unreadOnly: query.unread === "true" }),
);
