import { route } from "@/server/http/api";
import { competitionUpdateSchema, getVisibleCompetition, updateCompetition } from "@/server/services/competitions";
import { getParticipation } from "@/server/services/access";
import { LIMITS } from "@/server/ratelimit";

export const GET = route<{ id: string }>({}, async ({ user, params }) => {
  const { competition, isStaff } = await getVisibleCompetition(user, params.id);
  const participation = user ? await getParticipation(user.id, competition) : null;
  return { competition, isStaff, participation };
});

export const PATCH = route<{ id: string }, ReturnType<typeof competitionUpdateSchema.parse>>(
  { auth: "required", body: competitionUpdateSchema, rateLimit: { name: "comp.update", ...LIMITS.mutation } },
  async ({ user, params, body }) => updateCompetition(user, params.id, body),
);
