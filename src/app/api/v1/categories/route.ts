import { route } from "@/server/http/api";
import { listCategories } from "@/server/services/challenges";

export const GET = route({}, async () => listCategories());
