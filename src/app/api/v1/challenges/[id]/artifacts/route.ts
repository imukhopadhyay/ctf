import { route } from "@/server/http/api";
import { AppError, badRequest } from "@/server/errors";
import { env } from "@/server/env";
import { uploadArtifact } from "@/server/services/artifacts";

/** Multipart upload: fields `file`, optional `description`, `visible` ("true"/"false"). */
export const POST = route<{ id: string }>({ auth: "required", rawBody: true }, async ({ user, params, req, ip }) => {
  const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes + 64 * 1024) throw new AppError("PAYLOAD_TOO_LARGE", `Upload exceeds ${env().MAX_UPLOAD_MB} MB.`);
  if (!(req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) throw badRequest("Expected multipart/form-data.");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Missing file field.");
  if (file.size > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE", `Upload exceeds ${env().MAX_UPLOAD_MB} MB.`);
  const data = Buffer.from(await file.arrayBuffer());
  const artifact = await uploadArtifact(
    user,
    params.id,
    { filename: file.name, data, description: String(form.get("description") ?? ""), visible: form.get("visible") !== "false" },
    { ip },
  );
  const { storageKey: _k, ...safe } = artifact;
  return safe;
});
