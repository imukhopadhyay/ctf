import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/current";
import { getArtifactMetadata } from "@/server/services/artifacts";
import { formatBytes, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Artifact" };

function renderValue(v: unknown): React.ReactNode {
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-muted">none</span>;
    if (typeof v[0] === "object") return <pre className="max-h-64 overflow-auto rounded bg-bg p-2 font-mono text-xs">{JSON.stringify(v, null, 2)}</pre>;
    return <span className="font-mono text-xs">{v.join(", ")}</span>;
  }
  if (typeof v === "object" && v !== null) return <pre className="font-mono text-xs">{JSON.stringify(v, null, 2)}</pre>;
  return <span className="font-mono">{String(v)}</span>;
}

export default async function ArtifactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/artifacts/${id}`);
  const res = await getArtifactMetadata(user, id).catch(() => null);
  if (!res) notFound();
  const { artifact: a, challenge } = res;
  const meta = (a.metadata ?? {}) as Record<string, unknown>;
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/competitions/${challenge.competition.slug}/challenges/${challenge.id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />{challenge.title}</Link>
      <PageHeader eyebrow="artifact" title={<span className="font-mono">{a.filename}</span>} description={a.description || undefined}
        actions={<Button asChild><a href={`/api/v1/artifacts/${a.id}/download`} download><Download />Download</a></Button>} />
      <Alert tone="warning" title="Handle as untrusted evidence" className="mb-6">
        <span className="inline-flex items-start gap-1"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />This file is delivered as an opaque download and is never rendered in the browser. Analyse executables and archives inside an isolated VM.</span>
      </Alert>
      <Card>
        <CardHeader><CardTitle>Integrity & metadata</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-[180px_1fr]">
            <dt className="text-muted">SHA-256</dt><dd className="break-all font-mono text-xs">{a.sha256}</dd>
            <dt className="text-muted">Size</dt><dd>{formatBytes(a.sizeBytes)} ({a.sizeBytes.toLocaleString()} bytes)</dd>
            <dt className="text-muted">Detected type</dt><dd className="font-mono">{a.detectedType}</dd>
            <dt className="text-muted">Uploaded</dt><dd>{formatDateTime(a.createdAt)}</dd>
            {Object.entries(meta).map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-muted">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</dt><dd>{renderValue(v)}</dd></div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-subtle">Verify after download: <code className="font-mono">sha256sum {a.filename}</code></p>
        </CardContent>
      </Card>
    </div>
  );
}
