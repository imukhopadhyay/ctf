import { route } from "@/server/http/api";
import { getChallengeView } from "@/server/services/challenges";

export const GET = route<{ id: string; challengeId: string }>({ auth: "required" }, async ({ user, params }) =>
  getChallengeView(user, params.id, params.challengeId),
);
