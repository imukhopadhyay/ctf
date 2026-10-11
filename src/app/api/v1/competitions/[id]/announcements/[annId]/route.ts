import { route } from "@/server/http/api";
import { deleteAnnouncement } from "@/server/services/competitions";

export const DELETE = route<{ id: string; annId: string }>({ auth: "required" }, async ({ user, params }) => {
  await deleteAnnouncement(user, params.id, params.annId);
  return { deleted: true };
});
