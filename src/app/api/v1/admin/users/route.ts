import { z } from "zod";
import { route } from "@/server/http/api";
import { createUser, createUserSchema, listUsers, userQuerySchema } from "@/server/services/admin";

export const GET = route<Record<string, string>, undefined, z.infer<typeof userQuerySchema>>({ auth: "required", query: userQuerySchema }, async ({ user, query }) =>
  listUsers(user, query),
);
export const POST = route<Record<string, string>, z.infer<typeof createUserSchema>>({ auth: "required", body: createUserSchema }, async ({ user, body }) =>
  createUser(user, body),
);
