import { z } from "zod";
import { route } from "@/server/http/api";
import { institutionSchema, listInstitutions, upsertInstitution } from "@/server/services/admin";

export const GET = route({}, async () => listInstitutions());
export const POST = route<Record<string, string>, z.infer<typeof institutionSchema>>({ auth: "required", body: institutionSchema }, async ({ user, body }) =>
  upsertInstitution(user, body),
);
