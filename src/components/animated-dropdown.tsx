"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function AnimatedDropdown({ label, children, ariaLabel }: { label: string; children: ReactNode; ariaLabel: string }) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const reducedMotion = useRef(false);
  const [open, setOpen] = useState(false);
  const { contextSafe } = useGSAP({ scope: root });

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: reduce)", () => { reducedMotion.current = true; });
    media.add("(prefers-reduced-motion: no-preference)", () => { reducedMotion.current = false; });
    gsap.set(menu.current, { autoAlpha: 0, y: 6, scale: 0.97, transformOrigin: "top right" });
    gsap.set(menu.current?.querySelectorAll<HTMLElement>("[data-menu-item]"), { autoAlpha: 0, y: 6 });
    return () => media.revert();
  }, { scope: root });

  const animateOpen = contextSafe(() => {
    const panel = menu.current;
    const items = panel?.querySelectorAll<HTMLElement>("[data-menu-item]");
    if (!panel) return;
    gsap.killTweensOf([panel, ...(items ? Array.from(items) : [])]);
    gsap.set([panel, ...(items ? Array.from(items) : [])], { visibility: "visible" });
    const duration = reducedMotion.current ? 0 : 0.24;
    const timeline = gsap.timeline({ defaults: { overwrite: "auto" } });
    timeline.to(panel, { autoAlpha: 1, y: 0, scale: 1, duration, ease: "power3.out" }, 0);
    if (items?.length) timeline.to(items, { autoAlpha: 1, y: 0, duration: reducedMotion.current ? 0 : 0.2, stagger: reducedMotion.current ? 0 : 0.035, ease: "power3.out" }, 0.025);
  });

  const animateClose = contextSafe(() => {
    const panel = menu.current;
    const items = panel?.querySelectorAll<HTMLElement>("[data-menu-item]");
    if (!panel) return;
    gsap.killTweensOf([panel, ...(items ? Array.from(items) : [])]);
    if (reducedMotion.current) {
      gsap.set([panel, ...(items ? Array.from(items) : [])], { autoAlpha: 0, y: 6, scale: 0.97 });
      return;
    }
    const timeline = gsap.timeline({ defaults: { overwrite: "auto" } });
    if (items?.length) timeline.to(items, { autoAlpha: 0, y: 6, duration: 0.12, stagger: { each: 0.015, from: "end" }, ease: "power2.in" }, 0);
    timeline.to(panel, { autoAlpha: 0, y: 6, scale: 0.97, duration: 0.16, ease: "power2.in" }, 0);
  });

  const toggle = () => {
    const next = !openRef.current;
    openRef.current = next;
    setOpen(next);
    if (next) animateOpen();
    else animateClose();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) {
        openRef.current = false;
        setOpen(false);
        animateClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        openRef.current = false;
        setOpen(false);
        animateClose();
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, animateClose]);

  return (
    <div ref={root} className="relative">
      <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle}
        className="flex cursor-pointer items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:border-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200">
        {label}<svg className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m3.5 6 4.5 4 4.5-4" /></svg>
      </button>
      <div ref={menu} role="menu" aria-label={ariaLabel} aria-hidden={!open}
        className={`absolute right-0 top-[calc(100%+8px)] z-30 min-w-44 overflow-visible rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-lg ${open ? "" : "pointer-events-none"}`}
        style={{ visibility: "hidden", opacity: 0, transform: "translateY(6px) scale(.97)", transformOrigin: "top right", willChange: "transform, opacity" }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("[data-menu-item]")) {
            openRef.current = false;
            setOpen(false);
            animateClose();
          }
        }}>
        {children}
      </div>
    </div>
  );
}
