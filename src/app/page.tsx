import Link from "next/link";
import { ArrowRight, Flag, ShieldCheck, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { CategoryIcon } from "@/components/category-icon";
import { CompetitionCard } from "@/components/competition-card";
import { listCompetitions } from "@/server/services/competitions";
import { listCategories } from "@/server/services/challenges";
import { publicStats } from "@/server/services/analytics";
import { getCurrentUser } from "@/server/auth/current";

export default async function LandingPage() {
  const [user, stats, competitions, categories] = await Promise.all([getCurrentUser(), publicStats(), listCompetitions(null), listCategories()]);
  const active = competitions.filter((c) => c.status === "ACTIVE" || c.status === "PAUSED");
  const upcoming = competitions.filter((c) => c.status === "SCHEDULED");
  const completed = competitions.filter((c) => c.status === "COMPLETED" || c.status === "ARCHIVED").slice(0, 3);

  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface via-bg to-surface px-6 py-14 md:px-12">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">capture · the · flag</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            Learn security by <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">breaking things safely</span>.
          </h1>
          <p className="mt-4 text-lg text-muted">
            CyberQuest hosts gamified CTF competitions in web exploitation, cryptography, reverse engineering and digital forensics —
            with isolated targets, synthetic evidence and transparent scoring.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href={user ? "/dashboard" : "/register"}>{user ? "Go to dashboard" : "Join a competition"} <ArrowRight /></Link></Button>
            <Button asChild size="lg" variant="secondary"><Link href="/competitions">Browse competitions</Link></Button>
          </div>
        </div>
        <dl className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Registered participants", value: stats.participants, icon: Users },
            { label: "Challenges solved", value: stats.solves, icon: Flag },
            { label: "Competitions", value: stats.competitions, icon: Trophy },
            { label: "Published challenges", value: stats.challenges, icon: ShieldCheck },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-bg/60 p-4">
              <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted"><s.icon className="h-4 w-4 text-primary" />{s.label}</dt>
              <dd className="mt-1 font-mono text-2xl font-semibold">{s.value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="live">
        <div className="mb-4 flex items-end justify-between">
          <h2 id="live" className="text-xl font-semibold">Live & upcoming</h2>
          <Link href="/competitions" className="text-sm text-accent hover:underline">All competitions →</Link>
        </div>
        {active.length + upcoming.length === 0 ? (
          <EmptyState icon={Trophy} title="No competitions are scheduled right now">Check back soon, or ask your organizer for an invitation.</EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...active, ...upcoming].map((c) => <CompetitionCard key={c.slug} c={c} />)}
          </div>
        )}
      </section>

      <section aria-labelledby="categories">
        <h2 id="categories" className="mb-4 text-xl font-semibold">Challenge categories</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {categories.map((cat) => (
            <Card key={cat.id}>
              <CardHeader>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><CategoryIcon slug={cat.slug} className="h-5 w-5" /></div>
                <CardTitle className="mt-2">{cat.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted">{cat.description}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      {completed.length > 0 && (
        <section aria-labelledby="completed">
          <h2 id="completed" className="mb-4 text-xl font-semibold">Recently completed</h2>
          <div className="grid gap-4 md:grid-cols-3">{completed.map((c) => <CompetitionCard key={c.slug} c={c} />)}</div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3" aria-label="Policies">
        <Card>
          <CardHeader><CardTitle>Rules</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted">Each competition publishes its own rules, scoring model and permitted tools. Flags are personal to you or your team — sharing them is cheating.</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Eligibility</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted">Open competitions accept anyone with an account; private and invitation-only events are restricted by organizers to their students, members or employees.</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Responsible use</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted">
            Attack only the targets a challenge provides. Never test the platform itself, other participants or third-party systems.{" "}
            <Link href="/help#responsible-use" className="text-accent hover:underline">Read the full policy</Link>.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
