"use client";

import { useEffect, useId, useRef, useState } from "react";
import { filterSelectCls } from "@/components/ui";
import { cap } from "@/lib/format";

type CheckboxFilterProps = {
  label: string;
  name: "languages" | "formats";
  options: string[];
  defaultSelected?: string[];
};

export function CheckboxFilter({ label, name, options, defaultSelected }: CheckboxFilterProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() => options.filter((value) => defaultSelected?.includes(value)));
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const summary = selected.length === 0 ? "Any" : selected.length === 1 ? cap(selected[0]) : `${selected.length} selected`;

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePress(event: PointerEvent) {
      if (event.target instanceof Node && !fieldsetRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (fieldsetRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        triggerRef.current?.focus();
      }
      setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <fieldset ref={fieldsetRef} className="relative min-w-0">
      <legend id={`${id}-label`} className="text-xs font-medium text-slate-600">{label}</legend>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-labelledby={`${id}-label ${id}-summary`}
        onClick={() => setOpen((previous) => !previous)}
        className={`${filterSelectCls} mt-1 flex items-center justify-between gap-2 text-left`}
      >
        <span id={`${id}-summary`} className="min-w-0 truncate">{summary}</span>
        <svg
          aria-hidden="true"
          width={16}
          height={16}
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {/* Keep the inputs in the GET form while the panel is closed. */}
      <div
        id={`${id}-options`}
        hidden={!open}
        className="absolute mt-1 w-full rounded-xl border border-slate-200/80 bg-white/95 p-3 text-xs text-slate-700 shadow-lg backdrop-blur-xl z-30"
      >
        <div className="grid grid-cols-2 gap-2">
          {options.map((value) => (
            <label key={value} className="flex min-h-7 min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs text-slate-700 hover:bg-slate-100/80">
              <input
                className="h-4 w-4 shrink-0"
                type="checkbox"
                name={name}
                value={value}
                checked={selected.includes(value)}
                onChange={(event) => {
                  const { checked } = event.currentTarget;
                  setSelected((previous) => checked ? [...previous, value] : previous.filter((item) => item !== value));
                }}
              />
              <span className="min-w-0 break-words">{cap(value)}</span>
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
