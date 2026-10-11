import { z } from "zod";
import { route } from "@/server/http/api";
import { updateUser, userUpdateSchema } from "@/server/services/admin";

export const PATCH = route<{ id: string }, z.infer<typeof userUpdateSchema>>({ auth: "required", body: userUpdateSchema }, async ({ user, params, body }) =>
  updateUser(user, params.id, body),
);
