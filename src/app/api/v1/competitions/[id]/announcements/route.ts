import { route } from "@/server/http/api";
import { announcementSchema, createAnnouncement, listAnnouncements } from "@/server/services/competitions";

export const GET = route<{ id: string }>({}, async ({ user, params }) => listAnnouncements(user, params.id));

export const POST = route<{ id: string }, ReturnType<typeof announcementSchema.parse>>(
  { auth: "required", body: announcementSchema },
  async ({ user, params, body }) => createAnnouncement(user, params.id, body),
);
