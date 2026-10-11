import { z } from "zod";
import { route } from "@/server/http/api";
import { institutionSchema, upsertInstitution } from "@/server/services/admin";

export const PATCH = route<{ id: string }, z.infer<typeof institutionSchema>>({ auth: "required", body: institutionSchema }, async ({ user, params, body }) =>
  upsertInstitution(user, body, params.id),
);
