import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata = { title: "Brands" };

export default function Page() {
  return <ModulePlaceholder title="Brands" items={["Brand profiles with client contacts", "Competitor brands list (feeds the competitor filter)"]} />;
}
