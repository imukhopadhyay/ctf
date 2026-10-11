import { route } from "@/server/http/api";

export const GET = route({}, async ({ user }) => ({ user }));
