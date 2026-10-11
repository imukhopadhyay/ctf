import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { Markdown } from "@/components/markdown";
import { ActionButton } from "@/components/organizer/action-button";
import { requireUser } from "@/server/auth/current";
import { competitionCan } from "@/server/services/access";
import { listAnnouncements } from "@/server/services/competitions";
import { formatDateTime } from "@/lib/utils";
import { AnnouncementForm } from "./form";

export default async function AnnouncementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canManage = await competitionCan(user, id, "announcement.manage");
  const items = await listAnnouncements(user, id);
  return (
    <div className="space-y-4">
      {canManage ? <AnnouncementForm competitionId={id} /> : <Alert tone="info">Read-only.</Alert>}
      {items.map((a) => (
        <Card key={a.id}>
          <CardHeader className="flex-row items-start justify-between">
            <div><CardTitle>{a.pinned ? "📌 " : ""}{a.title}</CardTitle><p className="text-xs text-subtle">{formatDateTime(a.createdAt)}</p></div>
            {canManage && <ActionButton size="icon" variant="ghost" aria-label="Delete announcement" path={`/api/v1/competitions/${id}/announcements/${a.id}`} method="DELETE" confirmText="Delete announcement?"><Trash2 /></ActionButton>}
          </CardHeader>
          <CardContent><Markdown>{a.body}</Markdown></CardContent>
        </Card>
      ))}
    </div>
  );
}
