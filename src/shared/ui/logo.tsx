import { cn } from "./cn";

/** The product's name; a brand, the same in every language. */
export const APP_NAME = "AkunMu";

/** Brand mark: an account tree in a tile. A root at the bottom, the trunk, and three leaves on its branches. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path d="M16 24.5V10.5M16 19.5 10.5 13.5M16 16.5l5.5-5.2" className="stroke-on-primary" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.72" />
      <circle cx="16" cy="25" r="2.7" className="fill-on-primary" />
      <circle cx="10" cy="12.8" r="2.5" className="fill-on-primary" />
      <circle cx="22" cy="10.6" r="2.5" className="fill-on-primary" />
      <circle cx="16" cy="8.2" r="2.3" className="fill-on-primary" opacity="0.85" />
    </svg>
  );
}

export function Logo({ className, nameClassName }: { className?: string; nameClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={cn("text-[15px] font-extrabold tracking-tight text-ink", nameClassName)}>{APP_NAME}</span>
    </span>
  );
}
