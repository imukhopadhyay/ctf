import { notFound } from "next/navigation";
import { CompetitionForm, toLocalInput } from "@/components/organizer/competition-form";
import { Alert } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { competitionCan } from "@/server/services/access";
import { listInstitutions } from "@/server/services/admin";
import { InviteCodeForm } from "./invite-code-form";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!(await competitionCan(user, id, "competition.configure"))) return <Alert tone="warning">Only organizers can change settings.</Alert>;
  const c = await db.competition.findUnique({ where: { id } });
  if (!c) notFound();
  const institutions = await listInstitutions();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {c.accessMode === "INVITATION" && <InviteCodeForm competitionId={id} hasCode={!!c.inviteCodeHash} />}
      <CompetitionForm
        locked={c.status === "ACTIVE" || c.status === "PAUSED"}
        institutions={institutions.map((i) => ({ id: i.id, name: i.name }))}
        initial={{
          ...c,
          startsAt: toLocalInput(c.startsAt), endsAt: toLocalInput(c.endsAt), registrationOpensAt: toLocalInput(c.registrationOpensAt),
          registrationDeadline: toLocalInput(c.registrationDeadline), freezeAt: toLocalInput(c.freezeAt),
        }}
      />
    </div>
  );
}
