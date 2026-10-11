import { route } from "@/server/http/api";
import { authorizeArtifactDownload } from "@/server/services/artifacts";
import { artifactStore } from "@/server/storage";
import { contentDisposition } from "@/server/domain/filename";

/**
 * Artifacts are always delivered as opaque downloads: never rendered inline,
 * never sniffed, and sandboxed by CSP should a browser try to display them.
 */
export const GET = route<{ id: string }>({ auth: "required" }, async ({ user, params, ip }) => {
  const artifact = await authorizeArtifactDownload(user, params.id, { ip });
  const stream = await artifactStore().stream(artifact.storageKey);
  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(artifact.sizeBytes),
      "Content-Disposition": contentDisposition(artifact.filename),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
      "X-Artifact-SHA256": artifact.sha256,
    },
  });
});
