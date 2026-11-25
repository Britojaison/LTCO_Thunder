import type { ComponentProps, ReactNode } from "react";

export const inputCls =
  "min-w-0 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 outline-none transition focus:border-[#ff6b2b] focus:ring-2 focus:ring-orange-100 disabled:bg-zinc-100";
export const btnPrimary =
  "inline-flex items-center justify-center rounded-xl bg-[#f97316] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea650d] hover:shadow-md disabled:opacity-50";
export const btnSecondary =
  "inline-flex items-center justify-center rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50";
export const btnDanger =
  "inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-zinc-400">{hint}</span>}
    </label>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-[#eceef2] bg-white p-5 shadow-[0_2px_12px_rgba(24,25,28,0.035)] ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "zinc" }: { children: ReactNode; tone?: "zinc" | "red" | "green" | "amber" }) {
  const tones = {
    zinc: "bg-slate-100 text-slate-700",
    red: "bg-red-50 text-red-700",
    green: "border border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function FitScore({ score }: { score: number | string | null }) {
  if (score === null || score === undefined) return <span className="text-xs text-zinc-400">–</span>;
  const n = Number(score);
  const tone = n >= 70 ? "bg-emerald-100 text-emerald-800" : n >= 45 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600";
  return <span className={`inline-flex w-10 justify-center rounded-full py-0.5 text-xs font-semibold ${tone}`}>{n}</span>;
}
