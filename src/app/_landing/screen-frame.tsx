import { Lock } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { APP_NAME } from "@/shared/ui/logo";
import { cn } from "@/shared/ui/cn";

/** A screenshot of the app in a browser window: title bar with its three dots and the app's name, then the image. */
export function ScreenFrame({
  src,
  alt,
  tone = "light",
  priority = false,
  sizes = "(min-width: 1024px) 1100px, 100vw",
  className,
  children,
}: {
  src: string;
  alt: string;
  tone?: "light" | "dark";
  priority?: boolean;
  sizes?: string;
  className?: string;
  /** Laid over the screenshot (annotations), positioned in percent of the image. */
  children?: ReactNode;
}) {
  const dark = tone === "dark";
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-2xl border shadow-[0_40px_80px_-30px_rgb(0_0_0/0.45),0_12px_24px_-12px_rgb(0_0_0/0.25)]",
        dark ? "border-white/10 bg-[#0b1411]" : "border-line bg-surface",
        className,
      )}
    >
      <div className={cn("flex h-9 items-center gap-2 border-b px-3.5", dark ? "border-white/10" : "border-line")}>
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span
          className={cn(
            "mx-auto inline-flex items-center gap-1.5 rounded-md px-3 py-0.5 text-[11px] font-medium",
            dark ? "bg-white/5 text-white/50" : "bg-subtle text-faint",
          )}
        >
          <Lock className="size-3" />
          {APP_NAME}
        </span>
        <span className="w-12" aria-hidden="true" />
      </div>
      <div className="relative">
        <Image src={src} alt={alt} width={1800} height={1125} sizes={sizes} priority={priority} className="block h-auto w-full" />
        {children}
      </div>
    </figure>
  );
}
