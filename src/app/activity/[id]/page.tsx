import { ActivityDetail } from "@/components/activity-detail";

type ActivityDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ActivityDetailPage({ params }: ActivityDetailPageProps) {
  const { id } = await params;
  return <ActivityDetail activityId={id} />;
}
