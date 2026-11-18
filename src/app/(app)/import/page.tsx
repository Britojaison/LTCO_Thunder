import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata = { title: "Import" };

export default function Page() {
  return <ModulePlaceholder title="Import" items={["Upload Google Sheet / CSV", "Column mapping and preview", "Duplicate detection by Instagram handle"]} />;
}
