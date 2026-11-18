import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata = { title: "Settings" };

export default function Page() {
  return <ModulePlaceholder title="Settings" items={["Agency name, logo and report colours", "Editable lists: niches, styles, stages, cities", "Custom fields", "Member invites and removal", "Full CSV export"]} />;
}
