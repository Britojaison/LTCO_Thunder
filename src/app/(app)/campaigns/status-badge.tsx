import { Badge } from "@/components/ui";

const TONES = { planning: "amber", live: "green", completed: "zinc", archived: "zinc" } as const;
const LABELS = { planning: "Planning", live: "Live", completed: "Completed", archived: "Archived" } as const;

export function StatusBadge({ status, ended = false }: { status: keyof typeof TONES; ended?: boolean }) {
  return <Badge tone={ended ? "zinc" : TONES[status] ?? "zinc"}>{ended ? "Ended" : LABELS[status] ?? status}</Badge>;
}
