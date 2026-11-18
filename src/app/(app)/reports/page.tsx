import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata = { title: "Reports" };

export default function Page() {
  return <ModulePlaceholder title="Reports" items={["Report builder with live preview", "Per-brand report templates", "Branded PDF export (no payouts or margins, ever)"]} />;
}
