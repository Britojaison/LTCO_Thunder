export function ModulePlaceholder({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-zinc-500">Coming next. Planned from the PRD:</p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-zinc-700">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </section>
  );
}
