import { notFound } from "next/navigation";
import { Megaphone, Pin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/misc";
import { Markdown } from "@/components/markdown";
import { getVisibleCompetition, listAnnouncements } from "@/server/services/competitions";
import { getParticipation } from "@/server/services/access";
import { getCurrentUser } from "@/server/auth/current";
import { registrationOpen } from "@/server/domain/competition-state";
import { formatDateTime } from "@/lib/utils";
import { RegistrationPanel } from "./registration-panel";

export default async function CompetitionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const res = await getVisibleCompetition(user, slug).catch(() => null);
  if (!res) notFound();
  const { competition: c, isStaff } = res;
  const [participation, announcements] = await Promise.all([user ? getParticipation(user.id, c) : null, listAnnouncements(user, c.id)]);
  const regOpen = c.isPractice ? c.status !== "DRAFT" && c.status !== "ARCHIVED" : registrationOpen(c, new Date());

  const facts: [string, string][] = [
    ["Starts", formatDateTime(c.startsAt, c.timezone)],
    ["Ends", c.endsAt ? formatDateTime(c.endsAt, c.timezone) : "Open-ended"],
    ["Registration deadline", c.registrationDeadline ? formatDateTime(c.registrationDeadline, c.timezone) : "Until the end"],
    ["Participation", c.mode === "TEAM" ? `Teams of ${c.minTeamSize}–${c.maxTeamSize}` : "Individual"],
    ["Access", { PUBLIC: "Open to all", PRIVATE: "Organizer approval required", INVITATION: "Invitation code required" }[c.accessMode]],
    ["Scoring", c.scoringModel === "DYNAMIC" ? "Dynamic (value decays as more solve)" : "Static points"],
    ["Tie-break", c.tieBreak === "EARLIEST_LAST_SOLVE" ? "Earliest last solve" : "Fewest submissions"],
    ["Hint penalties", c.hintPenaltiesEnabled ? "Enabled (deducted on unlock)" : "Disabled"],
    ["Wrong-answer penalty", c.wrongSubmissionPenalty ? `−${c.wrongSubmissionPenalty} points` : "None"],
    ["Leaderboard freeze", c.freezeAt ? formatDateTime(c.freezeAt, c.timezone) : "None"],
    ["Solutions", { NEVER: "Not disclosed", AFTER_SOLVE: "After you solve", AFTER_END: "After the competition" }[c.solutionDisclosure]],
    ["Timezone", c.timezone],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
            <TabsTrigger value="announcements">Announcements{announcements.length ? ` (${announcements.length})` : ""}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Card><CardContent className="pt-5">{c.description ? <Markdown>{c.description}</Markdown> : <p className="text-sm text-muted">No description provided.</p>}</CardContent></Card>
          </TabsContent>
          <TabsContent value="rules" className="space-y-4" id="rules">
            <Card><CardHeader><CardTitle>Competition rules</CardTitle></CardHeader><CardContent><Markdown>{c.rules || "_No rules published._"}</Markdown></CardContent></Card>
            <div className="grid gap-4 md:grid-cols-2">
              <Card><CardHeader><CardTitle className="text-success">Permitted tools</CardTitle></CardHeader><CardContent><Markdown>{c.permittedTools || "_Not specified._"}</Markdown></CardContent></Card>
              <Card><CardHeader><CardTitle className="text-danger">Prohibited activities</CardTitle></CardHeader><CardContent><Markdown>{c.prohibitedActivities || "_Not specified._"}</Markdown></CardContent></Card>
            </div>
          </TabsContent>
          <TabsContent value="announcements" id="announcements">
            {announcements.length === 0 ? (
              <EmptyState icon={Megaphone} title="No announcements yet" />
            ) : (
              <div className="space-y-3">
                {announcements.map((a) => (
                  <Card key={a.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">{a.pinned && <Pin className="h-4 w-4 text-warning" aria-label="Pinned" />}{a.title}</CardTitle>
                      <p className="text-xs text-subtle">{formatDateTime(a.createdAt, c.timezone)}{a.createdBy ? ` · ${a.createdBy.displayName}` : ""}</p>
                    </CardHeader>
                    <CardContent><Markdown>{a.body}</Markdown></CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <aside className="space-y-4">
        <RegistrationPanel
          competition={{ id: c.id, slug: c.slug, mode: c.mode, accessMode: c.accessMode, status: c.status }}
          loggedIn={!!user}
          isStaff={isStaff}
          registrationOpen={regOpen}
          participation={participation ? { status: participation.registrationStatus, teamId: participation.teamId } : null}
        />
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
