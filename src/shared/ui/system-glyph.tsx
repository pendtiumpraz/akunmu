import { cn } from "./cn";

/** An operating system's glyph (public/brands/systems), drawn in the current text color. */
export function SystemGlyph({ system, className }: { system: "windows" | "linux"; className?: string }) {
  const image = `url(/brands/systems/${system}.svg)`;
  return (
    <span
      aria-hidden="true"
      className={cn("block bg-current", className)}
      style={{ maskImage: image, WebkitMaskImage: image, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }}
    />
  );
}
