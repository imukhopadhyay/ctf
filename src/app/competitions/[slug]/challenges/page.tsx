import { notFound } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/current";
import { getVisibleCompetition } from "@/server/services/competitions";
import { listChallenges } from "@/server/services/challenges";
import { ChallengeCatalogue } from "./catalogue";

export const metadata = { title: "Challenges" };

export default async function ChallengesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/competitions/${slug}/challenges`);
  const vis = await getVisibleCompetition(user, slug).catch(() => null);
  if (!vis) notFound();
  const { competition, challenges, isStaff, participation } = await listChallenges(user, vis.competition.id);
  const notStarted = competition.startsAt > new Date() || competition.status === "SCHEDULED";
  const concluded = competition.status === "COMPLETED" || competition.status === "ARCHIVED";

  if (!isStaff && !concluded && participation.registrationStatus !== "APPROVED") {
    return (
      <EmptyState icon={Lock} title="Register to see the challenges" action={<Button asChild><Link href={`/competitions/${slug}`}>Go to registration</Link></Button>}>
        Challenges are visible to approved participants once the competition starts.
      </EmptyState>
    );
  }
  if (!isStaff && notStarted) {
    return <EmptyState icon={Lock} title="The competition has not started yet">Challenges unlock when the event begins.</EmptyState>;
  }

  return (
    <div className="space-y-4">
      {isStaff && <Alert tone="info" title="Staff view">You can see every challenge, including drafts. Participants only see published, released challenges.</Alert>}
      {competition.status === "PAUSED" && <Alert tone="warning" title="Competition paused">Submissions are temporarily disabled.</Alert>}
      {concluded && <Alert tone="info" title="Competition concluded">Challenges remain available for study. Submissions no longer score.</Alert>}
      {competition.mode === "TEAM" && !participation.teamId && !isStaff && !concluded && (
        <Alert tone="warning" title="You are not on a team">
          <Link href={`/competitions/${slug}/team`} className="underline">Create or join a team</Link> to submit flags.
        </Alert>
      )}
      <ChallengeCatalogue slug={slug} challenges={challenges} isStaff={isStaff} />
    </div>
  );
}
