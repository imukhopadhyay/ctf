/**
 * Produces a safe, display-only file name. Storage never uses this name
 * (artifacts are stored by content hash), but it is used in
 * Content-Disposition headers and must not enable traversal or header injection.
 */
export function sanitizeFilename(input: string, fallback = "artifact.bin"): string {
  // Take the last path segment for both separators.
  const base = input.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKC")
    // strip control characters, quotes and characters reserved on common filesystems
    .replace(/[\u0000-\u001f\u007f"<>:|?*;]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    // no leading dots (hidden files / "..")
    .replace(/^\.+/, "")
    .slice(0, 120);
  if (!cleaned || /^\.*$/.test(cleaned)) return fallback;
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
  return reserved.test(cleaned) ? `_${cleaned}` : cleaned;
}

/** RFC 6266 / 5987 Content-Disposition value forcing a download. */
export function contentDisposition(filename: string): string {
  const safe = sanitizeFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/[\\"]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
