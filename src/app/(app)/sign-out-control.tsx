"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

const CLOSE_MS = 180;

export function SignOutControl({ variant = "sidebar" }: { variant?: "sidebar" | "topbar" }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const frame = requestAnimationFrame(() => {
      setOpen(true);
      cancelRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [mounted]);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(false);
    setMounted(true);
  };

  const close = () => {
    setOpen(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setMounted(false);
      triggerRef.current?.focus();
      closeTimer.current = null;
    }, CLOSE_MS);
  };

  const onDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const first = cancelRef.current;
    const last = confirmRef.current;
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button ref={triggerRef} type="button" title="Sign out" aria-haspopup="dialog" aria-expanded={mounted}
        onClick={show}
        className={variant === "topbar" ? "group/item flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/90 bg-white/70 text-slate-600 transition hover:scale-[1.04] hover:bg-white hover:text-[#4f46e5]" : "group/item flex h-10 w-10 shrink-0 items-center justify-start gap-0 overflow-hidden whitespace-nowrap rounded-xl p-0 text-sm text-slate-600 transition-colors hover:text-[#111827] md:w-full md:hover:group-hover/sidebar:bg-[#ffe7d5]"}>
        <span className={variant === "topbar" ? "flex h-10 w-10 shrink-0 items-center justify-center" : "flex h-10 w-10 shrink-0 items-center justify-center md:w-16"}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors group-hover/item:bg-[#ffe7d5] md:group-hover/sidebar:bg-transparent">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" /><path d="M14 16l4-4-4-4M18 12H9" />
            </svg>
          </span>
        </span>
        {variant === "sidebar" && <span className="block max-w-0 shrink-0 -translate-x-1.5 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,transform] duration-200 md:group-hover/sidebar:max-w-32 md:group-hover/sidebar:translate-x-0 md:group-hover/sidebar:opacity-100">Sign out</span>}
      </button>
      {mounted && typeof document !== "undefined" && createPortal(
        <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] transition-opacity duration-[180ms] ease-out ${open ? "opacity-100" : "opacity-0"}`}
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="signout-title" aria-describedby="signout-description"
            onKeyDown={onDialogKeyDown}
            className={`w-full max-w-[400px] rounded-2xl border border-[#e5e7eb] bg-white p-6 text-center shadow-2xl transition-[opacity,transform] duration-[180ms] ease-out ${open ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}>
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#fff4eb] text-[#f97316]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" /><path d="M14 16l4-4-4-4M18 12H9" />
              </svg>
            </div>
            <h2 id="signout-title" className="mt-4 text-lg font-semibold text-[#111827]">Sign out of Thunder?</h2>
            <p id="signout-description" className="mt-2 text-sm leading-6 text-[#6b7280]">Are you sure you want to sign out?</p>
            <div className="mt-6 flex justify-center gap-2">
              <button ref={cancelRef} type="button" onClick={close}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm font-medium text-[#111827] transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200">No</button>
              <form action="/auth/signout" method="post">
                <button ref={confirmRef} type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-[#f97316] px-4 text-sm font-semibold text-white transition hover:bg-[#ea580c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">Yes, sign out</button>
              </form>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
