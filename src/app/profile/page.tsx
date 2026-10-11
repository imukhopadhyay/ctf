import Link from "next/link";
import { Award, Droplet, Flag, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Progress, Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { CategoryIcon } from "@/components/category-icon";
import { requireUser } from "@/server/auth/current";
import { getUserProgress } from "@/server/services/achievements";
import { mySubmissions } from "@/server/services/submissions";
import { listInstitutions } from "@/server/services/admin";
import { db } from "@/server/db";
import { formatDateTime } from "@/lib/utils";
import { ProfileForms } from "./profile-forms";

export const metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const user = await requireUser("/profile");
  const { cursor } = await searchParams;
  const [p, subs, me, institutions] = await Promise.all([
    getUserProgress(user.id),
    mySubmissions(user, { take: 20, cursor: cursor && /^c[a-z0-9]{20,}$/.test(cursor) ? cursor : undefined }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { displayName: true, institutionId: true, createdAt: true, email: true } }),
    listInstitutions(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`@${user.username}`} title={user.displayName} description={`Member since ${formatDateTime(me.createdAt)}`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Level" value={p.level} icon={Sparkles} sub={<><Progress value={p.xp - p.currentLevelXp} max={p.nextLevelXp - p.currentLevelXp} className="mt-1" label="Level progress" /><span>{p.xp} / {p.nextLevelXp} XP</span></>} />
        <Stat label="Total solves" value={p.totalSolves} icon={Flag} />
        <Stat label="First bloods" value={p.firstBloods} icon={Droplet} />
        <Stat label="Badges" value={p.earned.length} icon={Award} />
      </div>
      <Card>
        <CardHeader><CardTitle>Solves by category</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          {["web", "crypto", "reverse", "forensics"].map((c) => (
            <div key={c} className="flex items-center gap-3 rounded-lg border border-border p-3"><CategoryIcon slug={c} className="h-5 w-5 text-primary" /><span className="capitalize">{c}</span><span className="ml-auto font-mono text-lg">{p.categoryCounts[c] ?? 0}</span></div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Earned badges</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {p.earned.length === 0 ? <p className="text-sm text-muted">No badges yet.</p> : p.earned.map((a) => (
              <div key={a.key} className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <span className="text-2xl" aria-hidden>🏅</span>
                <div className="min-w-0"><p className="font-medium">{a.name} <span className="font-mono text-xs text-primary">+{a.xp} XP</span></p><p className="text-xs text-muted">{a.description}</p></div>
                <span className="ml-auto whitespace-nowrap text-xs text-subtle">{formatDateTime(a.awardedAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>In progress</CardTitle><CardDescription>Badges reward legitimate problem-solving only.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {p.available.map((a) => (
              <div key={a.key}>
                <div className="flex justify-between text-sm"><span>{a.name}</span><span className="font-mono text-xs text-muted">{a.current}/{a.target}</span></div>
                <p className="mb-1 text-xs text-subtle">{a.description}</p>
                <Progress value={a.current} max={a.target} label={a.name} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Submission history</CardTitle><CardDescription>Your submissions and your teammates&apos;. Submitted values are never stored.</CardDescription></CardHeader>
        <CardContent>
          {subs.items.length === 0 ? <p className="text-sm text-muted">No submissions yet.</p> : (
            <Table>
              <THead><TR><TH>When</TH><TH>Competition</TH><TH>Challenge</TH><TH>By</TH><TH>Result</TH><TH className="text-right">Points</TH></TR></THead>
              <TBody>
                {subs.items.map((s) => (
                  <TR key={s.id}>
                    <TD className="whitespace-nowrap text-xs text-muted">{formatDateTime(s.createdAt)}</TD>
                    <TD><Link href={`/competitions/${s.challenge.competition.slug}`} className="hover:text-primary">{s.challenge.competition.name}</Link></TD>
                    <TD><Link href={`/competitions/${s.challenge.competition.slug}/challenges/${s.challenge.id}`} className="hover:text-primary">{s.challenge.title}</Link></TD>
                    <TD className="text-muted">{s.user.displayName}</TD>
                    <TD><StatusBadge status={s.result} />{s.solve?.isFirstBlood && <span className="ml-1" title="First blood">🩸</span>}</TD>
                    <TD className="text-right font-mono">{s.solve ? `+${s.solve.points}` : ""}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          {subs.nextCursor && <Link href={`/profile?cursor=${subs.nextCursor}`} className="mt-3 inline-block text-sm text-accent hover:underline">Older submissions →</Link>}
        </CardContent>
      </Card>
      <ProfileForms displayName={me.displayName} institutionId={me.institutionId} institutions={institutions.map((i) => ({ id: i.id, name: i.name }))} />
    </div>
  );
}
