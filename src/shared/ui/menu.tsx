"use client";

import { Ellipsis, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";

export type MenuItem = { label: string; icon?: LucideIcon; onSelect: () => void; tone?: "danger"; hidden?: boolean };

/** A "more" button with a small list of actions; closes on outside click, Escape or a choice. */
export function Menu({ label, items, className, align = "right" }: { label: string; items: MenuItem[]; className?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = items.filter((item) => !item.hidden);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (visible.length === 0) return null;
  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink"
      >
        <Ellipsis className="size-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className={cn("absolute top-full z-40 mt-1 min-w-48 animate-pop rounded-xl border border-line bg-surface p-1 shadow-float", align === "right" ? "right-0" : "left-0")}
        >
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium",
                item.tone === "danger" ? "text-danger-ink hover:bg-danger-soft" : "text-ink-2 hover:bg-subtle hover:text-ink",
              )}
            >
              {item.icon ? <item.icon className="size-4 shrink-0" /> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
