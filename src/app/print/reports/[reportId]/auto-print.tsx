"use client";

import { useEffect } from "react";

/** Opens the print dialog once images have loaded (choose "Save as PDF"). */
export function AutoPrint() {
  useEffect(() => {
    const go = () => { window.setTimeout(() => window.print(), 300); };
    const imgs = Array.from(document.images).filter((i) => !i.complete);
    if (!imgs.length) { go(); return; }
    let left = imgs.length;
    const done = () => { left -= 1; if (left === 0) go(); };
    imgs.forEach((i) => { i.addEventListener("load", done, { once: true }); i.addEventListener("error", done, { once: true }); });
  }, []);
  return null;
}

export function PrintButton() {
  return <button onClick={() => window.print()} className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white">Print / Save as PDF</button>;
}
