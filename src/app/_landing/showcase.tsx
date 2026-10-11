"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/ui/cn";
import { ScreenFrame } from "./screen-frame";

export type ShowcaseItem = { key: string; title: string; body: string; image: string; alt: string };

/**
 * Four screens of the app, told as you scroll: on wide screens the text runs on the left while the screenshot stays
 * in place on the right and crossfades to the step in the middle of the window; on phones each step shows its own
 * screenshot.
 */
export function Showcase({ items }: { items: ShowcaseItem[] }) {
  const [active, setActive] = useState(0);
  const steps = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = steps.current.indexOf(entry.target as HTMLLIElement);
          if (index !== -1) setActive(index);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const step of steps.current) if (step) observer.observe(step);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
      <ol className="space-y-14 lg:space-y-[26vh] lg:py-[16vh]">
        {items.map((item, index) => (
          <li
            key={item.key}
            ref={(element) => {
              steps.current[index] = element;
            }}
            className={cn("transition-opacity duration-500", active === index ? "lg:opacity-100" : "lg:opacity-35")}
          >
            <span className="font-mono text-xs font-bold text-accent">0{index + 1}</span>
            <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-ink">{item.title}</h3>
            <p className="mt-3 max-w-md text-[15px] leading-7 text-muted">{item.body}</p>
            <div className="mt-6 lg:hidden">
              <ScreenFrame src={item.image} alt={item.alt} sizes="100vw" />
            </div>
          </li>
        ))}
      </ol>
      <div className="hidden lg:block">
        <div className="sticky top-24">
          <div className="relative">
            {items.map((item, index) => (
              <div
                key={item.key}
                aria-hidden={active !== index}
                className={cn(
                  "transition-[opacity,transform] duration-500 ease-out",
                  index === 0 ? "relative" : "absolute inset-0",
                  active === index ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0",
                )}
              >
                <ScreenFrame src={item.image} alt={item.alt} sizes="(min-width: 1024px) 720px, 100vw" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
