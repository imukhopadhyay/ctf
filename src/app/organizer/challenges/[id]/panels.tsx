"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api, errorText } from "@/lib/api-client";
import { formatBytes, formatDateTime } from "@/lib/utils";

function useAction() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setPending(true);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ tone: "success", text: ok });
      router.refresh();
      return true;
    } catch (e) {
      setMsg({ tone: "danger", text: errorText(e) });
      return false;
    } finally {
      setPending(false);
    }
  };
  return { msg, setMsg, pending, run };
}

const NEXT: Record<string, { to: string; label: string; variant?: "default" | "secondary" | "ghost" | "danger" }[]> = {
  DRAFT: [{ to: "IN_REVIEW", label: "Submit for review", variant: "secondary" }, { to: "PUBLISHED", label: "Publish" }, { to: "ARCHIVED", label: "Archive", variant: "ghost" }],
  IN_REVIEW: [{ to: "DRAFT", label: "Back to draft", variant: "ghost" }],
  APPROVED: [{ to: "PUBLISHED", label: "Publish" }, { to: "DRAFT", label: "Back to draft", variant: "ghost" }],
  PUBLISHED: [{ to: "DRAFT", label: "Unpublish", variant: "secondary" }, { to: "ARCHIVED", label: "Archive", variant: "ghost" }, { to: "RETIRED", label: "Retire", variant: "danger" }],
  ARCHIVED: [{ to: "DRAFT", label: "Restore to draft", variant: "secondary" }],
  RETIRED: [],
};

export function StatusActions({ challengeId, status, problems }: { challengeId: string; status: string; problems: string[] }) {
  const { msg, pending, run } = useAction();
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap gap-2">
          {NEXT[status]?.map((n) => (
            <Button key={n.to} size="sm" variant={n.variant ?? "default"} disabled={pending} onClick={() => confirm(`${n.label}?`) && run(() => api(`/api/v1/challenges/${challengeId}/status`, { method: "POST", body: { to: n.to } }), `Status changed to ${n.to}.`)}>{n.label}</Button>
          ))}
        </div>
        {problems.length > 0 && status !== "PUBLISHED" && <Alert tone="warning" title="Publication checklist"><ul className="list-disc pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul></Alert>}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      </CardContent>
    </Card>
  );
}

interface FlagMeta { id: string; type: string; label: string; caseSensitive: boolean; normalizeWhitespace: boolean; active: boolean; expiresAt: string | null; keyVersion: number; createdAt: string; rotatedAt: string | null }

export function FlagsPanel({ challengeId, accessMethod, flags, testedAt }: { challengeId: string; accessMethod: string; flags: FlagMeta[]; testedAt: string | null }) {
  const { msg, setMsg, pending, run } = useAction();
  const [type, setType] = useState("STATIC");
  const [test, setTest] = useState("");
  const base = `/api/v1/challenges/${challengeId}/flags`;
  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Alert tone="info" title="Flags are write-only">Only a keyed HMAC of each flag is stored. Flags can never be viewed again — to change one, rotate it. Per-instance flags are derived automatically for each isolated instance.</Alert>
      <Card>
        <CardHeader><CardTitle>Configured flags</CardTitle><CardDescription>{testedAt ? `Last successful test: ${formatDateTime(testedAt)}` : "Not tested since the last change."}</CardDescription></CardHeader>
        <CardContent>
          {flags.length === 0 ? <p className="text-sm text-muted">No flags configured.</p> : (
            <Table>
              <THead><TR><TH>Label</TH><TH>Type</TH><TH>Matching</TH><TH>Key ver.</TH><TH>Status</TH><TH className="sr-only">Actions</TH></TR></THead>
              <TBody>
                {flags.map((f) => (
                  <TR key={f.id}>
                    <TD className="font-medium">{f.label}</TD>
                    <TD><Badge tone="muted">{f.type.toLowerCase()}</Badge></TD>
                    <TD className="text-xs text-muted">{f.type === "STATIC" ? `${f.caseSensitive ? "case-sensitive" : "case-insensitive"}${f.normalizeWhitespace ? ", whitespace-normalized" : ""}` : "HMAC per instance"}{f.expiresAt ? ` · expires ${formatDateTime(f.expiresAt)}` : ""}</TD>
                    <TD className="font-mono">{f.keyVersion}</TD>
                    <TD>{f.active ? <Badge tone="success">active</Badge> : <Badge tone="muted">inactive</Badge>}</TD>
                    <TD className="space-x-2 whitespace-nowrap text-right">
                      {f.type === "STATIC" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => { const v = prompt("New flag value (min 4 chars):"); if (v) void run(() => api(`${base}/${f.id}`, { method: "PATCH", body: { action: "rotate", value: v } }), "Flag rotated. Re-test before publishing."); }}>Rotate</Button>}
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => api(`${base}/${f.id}`, { method: "PATCH", body: { action: "setActive", active: !f.active } }))}>{f.active ? "Deactivate" : "Activate"}</Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Add flag</CardTitle><CardDescription>Add several flags for multi-stage challenges; any active flag solves the challenge.</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              const ok = await run(() => api(base, { method: "POST", body: {
                type, value: type === "STATIC" ? f.get("value") : undefined, label: f.get("label") || "flag",
                caseSensitive: f.get("caseSensitive") === "on", normalizeWhitespace: f.get("normalizeWhitespace") === "on",
                expiresAt: f.get("expiresAt") ? new Date(`${f.get("expiresAt")}Z`).toISOString() : null,
              } }), "Flag added. Test it before publishing.");
              if (ok) form.reset();
            }}>
              <Field label="Type" htmlFor="ftype"><Select id="ftype" value={type} onChange={(e) => setType(e.target.value)}><option value="STATIC">Static value</option>{accessMethod === "INSTANCE" && <option value="INSTANCE">Per-instance (derived)</option>}</Select></Field>
              <Field label="Label" htmlFor="label"><Input id="label" name="label" placeholder="flag / stage 1" maxLength={60} /></Field>
              {type === "STATIC" && <Field label="Flag value" htmlFor="value"><Input id="value" name="value" type="password" autoComplete="off" required minLength={4} maxLength={512} className="font-mono" /></Field>}
              {type === "STATIC" && <><Checkbox name="caseSensitive" defaultChecked label="Case-sensitive" /><Checkbox name="normalizeWhitespace" label="Normalize internal whitespace" /></>}
              <Field label="Expires (UTC, optional)" htmlFor="expiresAt"><Input id="expiresAt" name="expiresAt" type="datetime-local" /></Field>
              <Button type="submit" disabled={pending}>Add flag</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Flag tester</CardTitle><CardDescription>Checks a candidate against static flags. Creates no submissions or score.</CardDescription></CardHeader>
          <CardContent>
            <form className="flex gap-2" onSubmit={async (e) => {
              e.preventDefault();
              try {
                const r = await api<{ matched: boolean; label: string | null }>(`${base}/test`, { method: "POST", body: { value: test } });
                setMsg(r.matched ? { tone: "success", text: `Match: "${r.label}". Flags marked as tested.` } : { tone: "warning", text: "No match." });
              } catch (err) {
                setMsg({ tone: "danger", text: errorText(err) });
              }
            }}>
              <Input aria-label="Candidate flag" value={test} onChange={(e) => setTest(e.target.value)} className="font-mono" placeholder="CQ{...}" required />
              <Button type="submit" variant="secondary">Test</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface HintRow { id: string; title: string; content: string; cost: number; order: number; requiresPrevious: boolean; minAttempts: number }

export function HintsManager({ challengeId, hints }: { challengeId: string; hints: HintRow[] }) {
  const { msg, pending, run } = useAction();
  const base = `/api/v1/challenges/${challengeId}/hints`;
  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {hints.map((h) => (
        <Card key={h.id}>
          <CardContent className="flex items-start gap-4 pt-5">
            <div className="min-w-0 flex-1">
              <p className="font-medium">#{h.order} {h.title} <span className="font-mono text-xs text-warning">cost {h.cost}</span></p>
              <p className="text-xs text-muted">{h.requiresPrevious ? "requires previous hint" : "independent"}{h.minAttempts ? ` · after ${h.minAttempts} wrong attempt(s)` : ""}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{h.content}</p>
            </div>
            <Button size="icon" variant="ghost" aria-label="Delete hint" disabled={pending} onClick={() => confirm("Delete this hint?") && run(() => api(`${base}/${h.id}`, { method: "DELETE" }))}><Trash2 /></Button>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader><CardTitle>Add hint</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-4" onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const ok = await run(() => api(base, { method: "POST", body: { title: f.get("title") || "Hint", content: f.get("content"), cost: Number(f.get("cost") || 0), order: Number(f.get("order") || hints.length + 1), requiresPrevious: f.get("requiresPrevious") === "on", minAttempts: Number(f.get("minAttempts") || 0) } }), "Hint added.");
            if (ok) form.reset();
          }}>
            <Field label="Title" htmlFor="htitle"><Input id="htitle" name="title" maxLength={80} /></Field>
            <Field label="Cost" htmlFor="hcost"><Input id="hcost" name="cost" type="number" min={0} defaultValue={0} /></Field>
            <Field label="Order" htmlFor="horder"><Input id="horder" name="order" type="number" min={0} defaultValue={hints.length + 1} /></Field>
            <Field label="Min wrong attempts" htmlFor="hmin"><Input id="hmin" name="minAttempts" type="number" min={0} defaultValue={0} /></Field>
            <Field label="Content (Markdown)" htmlFor="hcontent" className="md:col-span-4"><Textarea id="hcontent" name="content" required rows={3} /></Field>
            <Checkbox name="requiresPrevious" defaultChecked label="Requires previous hint" className="md:col-span-3" />
            <Button type="submit" disabled={pending}>Add hint</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

interface ArtifactRow { id: string; filename: string; sha256: string; sizeBytes: number; detectedType: string; visible: boolean; description: string }

export function ArtifactsManager({ challengeId, artifacts }: { challengeId: string; artifacts: ArtifactRow[] }) {
  const { msg, setMsg, pending, run } = useAction();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card>
        <CardHeader><CardTitle>Upload artifact</CardTitle><CardDescription>Files are inspected (type detection, archive traversal/symlink/bomb checks), stored immutably by SHA-256 and always served as downloads.</CardDescription></CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            fd.set("visible", fd.get("visible") === "on" ? "true" : "false");
            setUploading(true);
            setMsg(null);
            try {
              const res = await fetch(`/api/v1/challenges/${challengeId}/artifacts`, { method: "POST", body: fd, credentials: "same-origin" });
              const json = await res.json();
              if (!res.ok) throw new Error([json.error?.message, ...(json.error?.details ?? []).map((d: { message: string }) => d.message)].filter(Boolean).join(" "));
              setMsg({ tone: "success", text: `Uploaded ${json.data.filename} (${json.data.detectedType}).` });
              form.reset();
              router.refresh();
            } catch (err) {
              setMsg({ tone: "danger", text: errorText(err) });
            } finally {
              setUploading(false);
            }
          }}>
            <Field label="File" htmlFor="file"><Input id="file" name="file" type="file" required /></Field>
            <Field label="Description" htmlFor="adesc" className="min-w-64 flex-1"><Input id="adesc" name="description" maxLength={2000} /></Field>
            <Checkbox name="visible" defaultChecked label="Visible to participants" />
            <Button type="submit" disabled={uploading}><Upload />{uploading ? "Uploading…" : "Upload"}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          {artifacts.length === 0 ? <p className="text-sm text-muted">No artifacts.</p> : (
            <Table>
              <THead><TR><TH>File</TH><TH>Type</TH><TH>Size</TH><TH>SHA-256</TH><TH>Visibility</TH><TH className="sr-only">Actions</TH></TR></THead>
              <TBody>
                {artifacts.map((a) => (
                  <TR key={a.id}>
                    <TD><a href={`/artifacts/${a.id}`} className="font-mono text-sm hover:text-primary">{a.filename}</a>{a.description && <p className="text-xs text-subtle">{a.description}</p>}</TD>
                    <TD className="text-muted">{a.detectedType}</TD>
                    <TD className="text-muted">{formatBytes(a.sizeBytes)}</TD>
                    <TD><code className="font-mono text-[11px] text-subtle">{a.sha256.slice(0, 16)}…</code></TD>
                    <TD><button type="button" className="text-xs underline" disabled={pending} onClick={() => run(() => api(`/api/v1/artifacts/${a.id}`, { method: "PATCH", body: { visible: !a.visible } }))}>{a.visible ? "visible" : "hidden"}</button></TD>
                    <TD><Button size="icon" variant="ghost" aria-label={`Delete ${a.filename}`} disabled={pending} onClick={() => confirm("Remove this artifact? (The stored evidence blob is retained.)") && run(() => api(`/api/v1/artifacts/${a.id}`, { method: "DELETE" }))}><Trash2 /></Button></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ReviewForm({ challengeId }: { challengeId: string }) {
  const { msg, pending, run } = useAction();
  return (
    <Card>
      <CardHeader><CardTitle>Submit review</CardTitle><CardDescription>Assess quality and educational outcomes. Approving a challenge in review moves it to APPROVED.</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-3 md:grid-cols-3" onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const num = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
          const ok = await run(() => api(`/api/v1/challenges/${challengeId}/reviews`, { method: "POST", body: { verdict: f.get("verdict"), qualityRating: num("quality"), educationalRating: num("educational"), comments: f.get("comments") } }), "Review submitted.");
          if (ok) form.reset();
        }}>
          {msg && <Alert tone={msg.tone} className="md:col-span-3">{msg.text}</Alert>}
          <Field label="Verdict" htmlFor="verdict"><Select id="verdict" name="verdict"><option value="COMMENT">Comment</option><option value="APPROVE">Approve</option><option value="CHANGES_REQUESTED">Request changes</option></Select></Field>
          <Field label="Quality (1–5)" htmlFor="quality"><Input id="quality" name="quality" type="number" min={1} max={5} /></Field>
          <Field label="Educational value (1–5)" htmlFor="educational"><Input id="educational" name="educational" type="number" min={1} max={5} /></Field>
          <Field label="Comments" htmlFor="comments" className="md:col-span-3"><Textarea id="comments" name="comments" rows={4} maxLength={10000} /></Field>
          <Button type="submit" disabled={pending}>Submit review</Button>
        </form>
      </CardContent>
    </Card>
  );
}
