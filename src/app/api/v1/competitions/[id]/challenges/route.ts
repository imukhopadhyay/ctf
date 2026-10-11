import { route } from "@/server/http/api";
import { challengeInputSchema, createChallenge, listChallenges, type ChallengeInput } from "@/server/services/challenges";
import { LIMITS } from "@/server/ratelimit";

export const GET = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => {
  const { challenges, isStaff, participation } = await listChallenges(user, params.id);
  return { challenges, isStaff, participation };
});

export const POST = route<{ id: string }, ChallengeInput>(
  { auth: "required", body: challengeInputSchema, rateLimit: { name: "chal.create", ...LIMITS.mutation } },
  async ({ user, params, body }) => createChallenge(user, params.id, body),
);
