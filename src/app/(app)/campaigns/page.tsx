import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata = { title: "Campaigns" };

export default function Page() {
  return <ModulePlaceholder title="Campaigns" items={["Campaign list and overview (budget, billing, payouts, margin)", "Kanban pipeline per campaign", "Deals, contact log and payment tracking", "Posts and 24h / 7d / 30d metric snapshots"]} />;
}
