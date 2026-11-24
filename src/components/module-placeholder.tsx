export function ModulePlaceholder({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#18191c]">{title}</h1>
        <p className="mt-1 text-sm text-[#6b7280]">Tools to bring your creator and campaign data into Thunder.</p>
      </div>
      <div className="rounded-2xl border border-[#eceef2] bg-white p-6 shadow-[0_2px_12px_rgba(24,25,28,0.035)]">
        <p className="text-sm font-medium text-zinc-700">Planned capabilities</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600">
          {items.map((i) => <li key={i}>{i}</li>)}
        </ul>
      </div>
    </section>
  );
}
