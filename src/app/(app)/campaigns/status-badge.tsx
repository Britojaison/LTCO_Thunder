import { Badge } from "@/components/ui";

const TONES = { planning: "amber", live: "green", completed: "zinc", archived: "zinc" } as const;
const LABELS = { planning: "Planning", live: "Live", completed: "Completed", archived: "Archived" } as const;

export function StatusBadge({ status }: { status: keyof typeof TONES }) {
  return <Badge tone={TONES[status] ?? "zinc"}>{LABELS[status] ?? status}</Badge>;
}
