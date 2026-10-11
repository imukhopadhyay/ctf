import Link from "next/link";
import { Award, CalendarDays, Crosshair, Flag, Megaphone, Sparkles, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState, PageHeader, Progress, Stat } from "@/components/ui/misc";
import { CategoryIcon } from "@/components/category-icon";
import { DifficultyBadge, StatusBadge } from "@/components/status-badge";
import { Countdown } from "@/components/countdown";
import { requireUser } from "@/server/auth/current";
import { participantDashboard } from "@/server/services/dashboard";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser("/dashboard");
  const { denied } = await searchParams;
  const d = await participantDashboard(user);
  const f = d.focus;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`level ${d.progress.level}`} title={`Welcome, ${user.displayName}`} description={f ? `Focused on ${f.competition.name}` : "Join a competition to start earning points."}
        actions={<Button asChild variant="secondary"><Link href="/competitions">Browse competitions</Link></Button>} />
      {denied && <Alert tone="warning">You do not have access to that page.</Alert>}

      {!f && d.registrations.length === 0 && (
        <EmptyState icon={Trophy} title="You have not joined a competition yet" action={<Button asChild><Link href="/competitions">Find a competition</Link></Button>}>
          Register for an active or upcoming event to see your score, rank and recommended challenges here.
        </EmptyState>
      )}
      {!f && d.registrations.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Your registrations</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {d.registrations.map((r) => (
              <div key={r.competition.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/competitions/${r.competition.slug}`} className="hover:text-primary">{r.competition.name}</Link>
                <div className="flex items-center gap-2">
                  {r.competition.status === "SCHEDULED" && <Countdown target={r.competition.startsAt.toISOString()} label="Starts in" />}
                  <StatusBadge status={r.status === "PENDING" ? "PENDING" : r.competition.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {f && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
            <StatusBadge status={f.competition.status} />
            <Link href={`/competitions/${f.competition.slug}`} className="font-semibold hover:text-primary">{f.competition.name}</Link>
            {f.competition.endsAt && f.competition.status === "ACTIVE" && <span className="ml-auto"><Countdown target={f.competition.endsAt.toISOString()} label="Time left" /></span>}
          </div>
          {f.competition.mode === "TEAM" && !f.team && <Alert tone="warning" title="No team yet"><Link className="underline" href={`/competitions/${f.competition.slug}/team`}>Create or join a team</Link> to start scoring.</Alert>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Points" value={f.points} icon={Flag} sub={f.competition.mode === "TEAM" ? "team total" : undefined} />
            <Stat label="Rank" value={f.rank ? `#${f.rank}` : "—"} icon={Trophy} sub={`of ${f.totalSubjects}${f.frozen ? " · frozen" : ""}`} />
            <Stat label="Solved" value={`${f.solved}/${f.available}`} icon={Crosshair} sub={<Progress value={f.solved} max={f.available} className="mt-1" label="Solved" />} />
            <Stat label="Experience" value={`${d.progress.xp} XP`} icon={Sparkles} sub={<Progress value={d.progress.xp - d.progress.currentLevelXp} max={d.progress.nextLevelXp - d.progress.currentLevelXp} className="mt-1" label="Level progress" />} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Recommended next</CardTitle><CardDescription>Unsolved challenges, easiest first, favouring your weakest categories.</CardDescription></CardHeader>
              <CardContent>
                {f.recommended.length === 0 ? <p className="text-sm text-muted">Nothing left to recommend — impressive!</p> : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {f.recommended.map((c) => (
                      <Link key={c.id} href={`/competitions/${f.competition.slug}/challenges/${c.id}`} className="rounded-lg border border-border p-3 hover:border-border-strong">
                        <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-medium"><CategoryIcon slug={c.category.slug} className="h-4 w-4 text-primary" />{c.title}</span><span className="font-mono text-primary">{c.value}</span></div>
                        <div className="mt-2 flex gap-2"><DifficultyBadge difficulty={c.difficulty} /><Badge tone="muted">{c.solves} solves</Badge></div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Category progress</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {f.categories.map((c) => (
                  <div key={c.slug}>
                    <div className="mb-1 flex justify-between text-sm"><span className="flex items-center gap-2"><CategoryIcon slug={c.slug} className="h-4 w-4 text-primary" />{c.name}</span><span className="font-mono text-muted">{c.solved}/{c.total}</span></div>
                    <Progress value={c.solved} max={c.total} label={`${c.name} progress`} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle>Recent submissions</CardTitle></CardHeader>
              <CardContent>
                {f.recent.length === 0 ? <p className="text-sm text-muted">No submissions yet.</p> : (
                  <ul className="space-y-2 text-sm">
                    {f.recent.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{s.challenge.title}{f.competition.mode === "TEAM" && <span className="text-xs text-subtle"> · {s.user.displayName}</span>}</span>
                        <span className="flex items-center gap-2 whitespace-nowrap"><StatusBadge status={s.result} />{s.solve && <span className="font-mono text-xs text-success">+{s.solve.points}</span>}<span className="text-xs text-subtle">{relativeTime(s.createdAt)}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Team</CardTitle></CardHeader>
              <CardContent>
                {f.competition.mode !== "TEAM" ? <p className="text-sm text-muted">Individual competition.</p> : !f.team ? <p className="text-sm text-muted">Not on a team.</p> : (
                  <div className="space-y-2 text-sm">
                    <Link href={`/competitions/${f.competition.slug}/team`} className="font-semibold hover:text-primary">{f.team.name}</Link>
                    {f.team.contributions.map((m) => (
                      <div key={m.userId} className="flex justify-between"><span>{m.displayName}{m.role === "CAPTAIN" && " ★"}</span><span className="font-mono text-muted">{m.points} pts · {m.solves}</span></div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="h-4 w-4" />Announcements</CardTitle></CardHeader>
              <CardContent>
                {f.announcements.length === 0 ? <p className="text-sm text-muted">No announcements.</p> : (
                  <ul className="space-y-2 text-sm">
                    {f.announcements.map((a) => <li key={a.id}><Link href={`/competitions/${f.competition.slug}#announcements`} className="hover:text-primary">{a.title}</Link><p className="text-xs text-subtle">{relativeTime(a.createdAt)}</p></li>)}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><Award className="h-4 w-4" />Achievements</CardTitle><CardDescription>{d.progress.earned.length} earned · <Link href="/profile" className="text-accent hover:underline">view all</Link></CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {d.progress.earned.length === 0 ? <p className="text-sm text-muted">Solve challenges to earn your first badge.</p> : d.progress.earned.slice(0, 8).map((a) => <Badge key={a.key} tone="primary" title={a.description}>🏅 {a.name}</Badge>)}
          </CardContent>
        </Card>
        {d.daily && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Daily practice</CardTitle><CardDescription>{d.daily.competition.name}</CardDescription></CardHeader>
            <CardContent>
              <Link href={`/competitions/${d.daily.competition.slug}/challenges/${d.daily.id}`} className="font-medium hover:text-primary">{d.daily.title}</Link>
              <div className="mt-2 flex gap-2"><DifficultyBadge difficulty={d.daily.difficulty} /><Badge tone="muted">{d.daily.category.name}</Badge></div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
