import { z } from "zod";
import { route } from "@/server/http/api";
import { environmentSchema, upsertEnvironment } from "@/server/services/admin";

export const PATCH = route<{ id: string }, z.infer<typeof environmentSchema>>({ auth: "required", body: environmentSchema }, async ({ user, params, body }) =>
  upsertEnvironment(user, body, params.id),
);
