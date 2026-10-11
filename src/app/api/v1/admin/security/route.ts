import { z } from "zod";
import { route } from "@/server/http/api";
import { listSecurityEvents, securityQuerySchema } from "@/server/services/admin";

export const GET = route<Record<string, string>, undefined, z.infer<typeof securityQuerySchema>>({ auth: "required", query: securityQuerySchema }, async ({ user, query }) =>
  listSecurityEvents(user, query),
);
