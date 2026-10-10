import { cn } from "./cn";

/** The product's name; a brand, the same in every language. */
export const APP_NAME = "AkunMu";

/** Brand mark: one device branching to two places, one of them holding an account. The map in a tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path d="M9 16 16.5 10M9 16l7.5 6M16.5 10H23" className="stroke-on-primary" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.7" />
      <circle cx="9" cy="16" r="3.2" className="fill-on-primary" />
      <circle cx="16.5" cy="10" r="2.6" className="fill-on-primary" />
      <circle cx="16.5" cy="22" r="2.6" className="fill-on-primary" />
      <circle cx="23.5" cy="10" r="2.6" className="fill-on-primary" opacity="0.85" />
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
