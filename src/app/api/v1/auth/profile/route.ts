import { route } from "@/server/http/api";
import { profileSchema, updateProfile } from "@/server/services/auth";
import { LIMITS } from "@/server/ratelimit";

export const PATCH = route(
  { auth: "required", body: profileSchema, rateLimit: { name: "profile", ...LIMITS.mutation } },
  async ({ user, body }) => updateProfile(user!, body),
);
