import type { ComponentProps, ReactNode } from "react";

const inputBase =
  "min-w-0 w-full rounded-xl border border-white/90 bg-white/70 px-3 text-sm text-zinc-800 shadow-inner placeholder:text-zinc-400 outline-none backdrop-blur-sm transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100 disabled:bg-zinc-100/70";
export const inputCls = `${inputBase} py-2`;
export const compactInputCls = `${inputBase} h-9 py-1.5`;
export const filterSelectCls =
  "h-10 min-w-0 w-full rounded-xl border border-white/80 bg-white/75 px-3.5 text-sm text-slate-700 outline-none transition-colors hover:bg-white/90 focus:border-violet-300 focus:ring-2 focus:ring-violet-100";
export const btnPrimary =
  "inline-flex items-center justify-center rounded-xl bg-[#ff5a1f] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e64a13] hover:shadow-md disabled:opacity-50";
export const btnSecondary =
  "inline-flex items-center justify-center rounded-xl border border-white/80 bg-white/65 px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-white/90 disabled:opacity-50";
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
    <section className={`glass-card p-5 ${className}`}>
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
