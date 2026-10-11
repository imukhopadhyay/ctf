import { route } from "@/server/http/api";
import { registerSchema, registerUser } from "@/server/services/auth";

export const POST = route({ body: registerSchema }, async ({ body, ip }) => {
  const user = await registerUser(body, { ip });
  return { id: user.id, username: user.username };
});
