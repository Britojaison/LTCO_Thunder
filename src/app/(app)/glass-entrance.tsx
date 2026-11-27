"use client";

import { useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function GlassEntrance({ children, className }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const select = gsap.utils.selector(root);
      const panels = select("[data-gsap-enter]");
      const rows = select("[data-gsap-row]");
      const start = { opacity: 0, y: 15 };
      const finish = { opacity: 1, y: 0, duration: 0.65, ease: "power2.out", clearProps: "opacity,transform" };

      if (panels.length) gsap.fromTo(panels, start, { ...finish, stagger: 0.08 });
      if (rows.length) {
        gsap.fromTo(rows, start, {
          ...finish,
          delay: 0.16,
          stagger: { amount: Math.min(0.55, (rows.length - 1) * 0.04) },
        });
      }
    });
    return () => media.revert();
  }, { scope: root });

  return <div ref={root} className={className}>{children}</div>;
}
