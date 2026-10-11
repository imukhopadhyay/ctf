import { z } from "zod";
import { route } from "@/server/http/api";
import { environmentSchema, listEnvironments, upsertEnvironment } from "@/server/services/admin";

export const GET = route({ auth: "required" }, async ({ user }) => listEnvironments(user));
export const POST = route<Record<string, string>, z.infer<typeof environmentSchema>>({ auth: "required", body: environmentSchema }, async ({ user, body }) =>
  upsertEnvironment(user, body),
);
