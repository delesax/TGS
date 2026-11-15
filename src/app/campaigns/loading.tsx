import { ListSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ListSkeleton label="Loading Campaigns…" rows={4} />;
}
