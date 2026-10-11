import { PageHeader } from "@/components/ui/misc";
import { CompetitionForm, toLocalInput } from "@/components/organizer/competition-form";
import { requirePlatformPermission } from "@/server/auth/current";
import { listInstitutions } from "@/server/services/admin";

export const metadata = { title: "New competition" };

export default async function NewCompetitionPage() {
  await requirePlatformPermission("competition.create");
  const institutions = await listInstitutions();
  const start = new Date(Date.now() + 7 * 86400_000);
  start.setUTCHours(9, 0, 0, 0);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="organizer" title="New competition" description="Created as a draft. Add challenges, then publish when the configuration passes validation." />
      <CompetitionForm
        institutions={institutions.map((i) => ({ id: i.id, name: i.name }))}
        initial={{
          name: "", slug: "", tagline: null, description: "", bannerTheme: "teal", institutionId: null, timezone: "UTC",
          startsAt: toLocalInput(start), endsAt: toLocalInput(new Date(start.getTime() + 24 * 3600_000)), registrationOpensAt: "", registrationDeadline: "",
          mode: "INDIVIDUAL", minTeamSize: 1, maxTeamSize: 4, accessMode: "PUBLIC", scoringModel: "STATIC", tieBreak: "EARLIEST_LAST_SOLVE",
          rules: "", permittedTools: "", prohibitedActivities: "", hintPenaltiesEnabled: true, wrongSubmissionPenalty: 0, defaultAttemptLimit: null,
          freezeAt: "", identityDisplay: "FULL", allowTeamChangesWhileActive: false, solutionDisclosure: "AFTER_END", isPractice: false,
        }}
      />
    </div>
  );
}
