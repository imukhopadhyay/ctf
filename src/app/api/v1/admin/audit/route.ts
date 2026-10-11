import { z } from "zod";
import { route } from "@/server/http/api";
import { auditQuerySchema, listAuditLogs } from "@/server/services/admin";

export const GET = route<Record<string, string>, undefined, z.infer<typeof auditQuerySchema>>({ auth: "required", query: auditQuerySchema }, async ({ user, query }) =>
  listAuditLogs(user, query),
);
