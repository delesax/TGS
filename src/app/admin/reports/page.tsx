import { redirect } from "next/navigation";

// Sprint 4: reports are part of the one moderation queue.
export default function ReportsPage() {
  redirect("/admin/moderation");
}
