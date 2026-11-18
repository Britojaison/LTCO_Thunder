import Link from "next/link";

export function CampaignTabs({ id, active }: { id: string; active: "overview" | "pipeline" | "table" | "performance" | "report" }) {
  const tabs = [
    ["overview", "Overview", `/campaigns/${id}`],
    ["pipeline", "Pipeline", `/campaigns/${id}/pipeline`],
    ["table", "Table", `/campaigns/${id}/deals`],
    ["performance", "Performance", `/campaigns/${id}/performance`],
    ["report", "Client report", `/campaigns/${id}/report`],
  ] as const;
  return (
    <nav className="flex gap-1 border-b border-zinc-200">
      {tabs.map(([key, label, href]) => (
        <Link key={key} href={href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${key === active ? "border-zinc-900 font-medium text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
