import { route } from "@/server/http/api";
import { explainScore } from "@/server/services/score-admin";

export const GET = route<{ id: string; subjectKey: string }>({ auth: "required" }, async ({ user, params }) =>
  explainScore(user, params.id, decodeURIComponent(params.subjectKey)),
);
