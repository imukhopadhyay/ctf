import { z } from "zod";
import { route } from "@/server/http/api";
import { reviewInputSchema, submitReview } from "@/server/services/challenges";

export const POST = route<{ id: string }, z.infer<typeof reviewInputSchema>>({ auth: "required", body: reviewInputSchema }, async ({ user, params, body }) =>
  submitReview(user, params.id, body),
);
