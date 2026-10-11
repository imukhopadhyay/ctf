import { route } from "@/server/http/api";
import { challengeUpdateSchema, deleteChallenge, getChallengeForStaff, updateChallenge, type ChallengeInput } from "@/server/services/challenges";
import { LIMITS } from "@/server/ratelimit";

export const GET = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => getChallengeForStaff(user, params.id));

export const PATCH = route<{ id: string }, Partial<ChallengeInput>>(
  { auth: "required", body: challengeUpdateSchema, rateLimit: { name: "chal.update", ...LIMITS.mutation } },
  async ({ user, params, body }) => updateChallenge(user, params.id, body),
);

export const DELETE = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => {
  await deleteChallenge(user, params.id);
  return { deleted: true };
});
