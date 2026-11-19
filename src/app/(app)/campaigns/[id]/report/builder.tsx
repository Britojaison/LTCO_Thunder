"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ReportDocument } from "@/components/report/report-document";
import type { ReportData } from "@/lib/services/reports";
import {
  REPORT_METRICS, REPORT_METRIC_LABELS, REPORT_SECTIONS, REPORT_SNAPSHOTS, SECTION_LABELS,
  defaultReportConfig, type ReportConfig,
} from "@/lib/services/report-config";
import { createReportAction, saveTemplateAction, deleteTemplateAction } from "../../report-actions";
import { btnPrimary, btnSecondary, inputCls } from "@/components/ui";

type Template = { id: string; name: string; config: ReportConfig };
type Past = { id: string; title: string | null; created_at: string };

export function ReportBuilder({ data, templates, past, brandId }: { data: ReportData; templates: Template[]; past: Past[]; brandId: string }) {
  const router = useRouter();
  const [config, setConfig] = useState<ReportConfig>(defaultReportConfig());
  const [templateId, setTemplateId] = useState<string>("");
  const [tplName, setTplName] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [busy, start] = useTransition();

  const set = <K extends keyof ReportConfig>(k: K, v: ReportConfig[K]) => setConfig((c) => ({ ...c, [k]: v }));
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) setConfig((c) => ({ ...t.config, title: c.title, excludedDeals: c.excludedDeals, excludedPosts: c.excludedPosts }));
  };

  const download = () =>
    start(async () => {
      setMsg({});
      const res = await createReportAction(data.campaign.id, config, templateId || null);
      if ("error" in res && res.error) return setMsg({ error: res.error });
      if ("id" in res) router.push(`/print/reports/${res.id}`);
    });

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <aside className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <button disabled={busy} onClick={download} className={`${btnPrimary} w-full`}>{busy ? "Preparing…" : "Download PDF"}</button>
          <p className="mt-2 text-xs text-zinc-500">Opens the print view. Choose “Save as PDF” as the printer. The selections are saved with the report.</p>
          {msg.error && <p className="mt-2 text-sm text-red-600">{msg.error}</p>}
        </div>

        <Panel title="Template">
          <select value={templateId} onChange={(e) => applyTemplate(e.target.value)} className={inputCls}>
            <option value="">Default (everything)</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="mt-2 flex gap-1">
            <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder={`Save as template for ${data.brand.name}`} className={`${inputCls} py-1.5`} />
            <button className={btnSecondary} disabled={busy || !tplName.trim()}
              onClick={() => start(async () => { const r = await saveTemplateAction(brandId, tplName, config); setMsg(r); if (r.ok) setTplName(""); })}>Save</button>
          </div>
          {templateId && (
            <button className="mt-1 text-xs text-zinc-400 hover:text-red-600"
              onClick={() => start(async () => { await deleteTemplateAction(templateId); setTemplateId(""); })}>Delete this template</button>
          )}
          {msg.ok && <p className="mt-1 text-xs text-emerald-700">{msg.ok}</p>}
        </Panel>

        <Panel title="Cover">
          <input value={config.title} onChange={(e) => set("title", e.target.value)} placeholder={data.campaign.name} className={inputCls} />
          <textarea value={config.intro} onChange={(e) => set("intro", e.target.value)} rows={3} placeholder="Intro note for the client (optional)" className={`${inputCls} mt-2`} />
        </Panel>

        <Panel title="Numbers from">
          <div className="flex flex-wrap gap-1">
            {REPORT_SNAPSHOTS.map((s) => (
              <button key={s} onClick={() => set("snapshot", s)}
                className={`rounded-md border px-2.5 py-1 text-xs ${config.snapshot === s ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300"}`}>
                {s === "latest" ? "Latest" : s}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Cost figures">
          <label className="flex items-center gap-2 text-sm"><input type="radio" checked={config.costs === "client_price"} onChange={() => set("costs", "client_price")} /> Show client price and cost per view / engagement</label>
          <label className="mt-1 flex items-center gap-2 text-sm"><input type="radio" checked={config.costs === "hidden"} onChange={() => set("costs", "hidden")} /> Hide all cost figures</label>
          <p className="mt-2 text-xs text-zinc-400">Payouts, margins, internal notes and team ratings are never included.</p>
        </Panel>

        <Panel title="Influencer details">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={config.showProduct} onChange={() => set("showProduct", !config.showProduct)} /> Show product
          </label>
          {!data.influencers.some((i) => i.product) && <p className="mt-1 text-xs text-zinc-400">No products entered for this campaign yet.</p>}
        </Panel>

        <Panel title="Sections">
          {REPORT_SECTIONS.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.sections.includes(s)} onChange={() => set("sections", toggle(config.sections, s))} /> {SECTION_LABELS[s]}
            </label>
          ))}
        </Panel>

        <Panel title="Metrics">
          <div className="grid grid-cols-2 gap-x-2">
            {REPORT_METRICS.filter((m) => config.costs === "client_price" || !m.startsWith("cost")).map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={config.metrics.includes(m)} onChange={() => set("metrics", toggle(config.metrics, m))} /> {REPORT_METRIC_LABELS[m]}
              </label>
            ))}
          </div>
        </Panel>

        <Panel title={`Influencers and posts (${data.influencers.length})`}>
          <p className="mb-2 text-xs text-zinc-500">Only influencers at <strong>Confirmed</strong> or later (Content review, Posted, Data collected, Paid) are included.</p>
          {data.influencers.length === 0 && <p className="text-sm text-zinc-500">No confirmed influencers yet. Move them to Confirmed in the pipeline.</p>}
          <ul className="space-y-1.5">
            {data.influencers.map((i) => {
              const off = config.excludedDeals.includes(i.deal_id);
              return (
                <li key={i.deal_id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!off} onChange={() => set("excludedDeals", toggle(config.excludedDeals, i.deal_id))} />
                    <span className={off ? "text-zinc-400 line-through" : ""}>{i.name}</span>
                    <span className="text-xs text-zinc-400">{i.posts.length} post{i.posts.length === 1 ? "" : "s"}</span>
                  </label>
                  {!off && i.posts.length > 1 && (
                    <ul className="ml-6">
                      {i.posts.map((p, n) => (
                        <li key={p.post_id}>
                          <label className="flex items-center gap-2 text-xs text-zinc-600">
                            <input type="checkbox" checked={!config.excludedPosts.includes(p.post_id)} onChange={() => set("excludedPosts", toggle(config.excludedPosts, p.post_id))} />
                            Post {n + 1} · {p.format}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>

        {past.length > 0 && (
          <Panel title="Past reports">
            <ul className="space-y-1 text-sm">
              {past.slice(0, 10).map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <Link href={`/print/reports/${r.id}`} className="truncate text-blue-700 hover:underline">{r.title || "Report"}</Link>
                  <span className="shrink-0 text-xs text-zinc-400">{new Date(r.created_at).toLocaleDateString("en-IN")}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </aside>

      <div className="min-w-0 overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-200/60 p-4">
        <div className="report-sheet mx-auto w-[210mm] shadow-lg">
          <ReportDocument data={data} config={config} />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {children}
    </section>
  );
}
