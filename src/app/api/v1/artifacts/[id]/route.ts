import { z } from "zod";
import { route } from "@/server/http/api";
import { deleteArtifact, getArtifactMetadata, updateArtifact } from "@/server/services/artifacts";

export const GET = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => getArtifactMetadata(user, params.id));

export const PATCH = route<{ id: string }, { visible?: boolean; description?: string }>(
  { auth: "required", body: z.object({ visible: z.boolean().optional(), description: z.string().max(2000).optional() }) },
  async ({ user, params, body }) => {
    const { storageKey: _k, ...safe } = await updateArtifact(user, params.id, body);
    return safe;
  },
);

export const DELETE = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => {
  await deleteArtifact(user, params.id);
  return { deleted: true };
});
