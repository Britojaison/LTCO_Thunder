/** FormData → plain object. Keys in `arrays` collect every value (checkbox groups). */
export function formToObject(form: FormData, arrays: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    if (key.startsWith("$")) continue; // React internals
    out[key] = arrays.includes(key) ? form.getAll(key).map(String) : String(form.get(key) ?? "");
  }
  for (const key of arrays) if (!(key in out)) out[key] = [];
  return out;
}

/** Same, as strings only, for re-filling a form after a validation error. */
export function formToDefaults(form: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(form.keys())) {
    if (key.startsWith("$")) continue;
    const all = form.getAll(key).map(String);
    out[key] = all.length > 1 ? all : all[0] ?? "";
  }
  return out;
}
