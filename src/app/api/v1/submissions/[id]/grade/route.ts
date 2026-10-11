import { z } from "zod";
import { route } from "@/server/http/api";
import { gradeSchema, gradeSubmission } from "@/server/services/submissions";

export const POST = route<{ id: string }, z.infer<typeof gradeSchema>>({ auth: "required", body: gradeSchema }, async ({ user, params, body }) =>
  gradeSubmission(user, params.id, body),
);
