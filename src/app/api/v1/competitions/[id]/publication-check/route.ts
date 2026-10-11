import { route } from "@/server/http/api";
import { publicationProblems } from "@/server/services/competitions";
import { requireCompetitionPermission } from "@/server/services/access";

export const GET = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => {
  await requireCompetitionPermission(user, params.id, "competition.configure");
  const problems = await publicationProblems(params.id);
  return { ready: problems.length === 0, problems };
});
