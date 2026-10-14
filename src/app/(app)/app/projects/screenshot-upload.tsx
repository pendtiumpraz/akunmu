"use client";

import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { MAX_SCREENSHOT_BYTES, SCREENSHOT_ACCEPT } from "@/modules/projects/types";
import { api } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Spinner } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { useToast } from "@/shared/ui/toast";

/**
 * Stores a picked image as the project's screenshot right away (Vercel Blob on the web, the uploads folder on the
 * desktop), without opening the project. `compact` is the icon-only button on a fruit in the tree.
 */
export function ScreenshotUpload({
  projectId,
  onUploaded,
  compact = false,
  className,
}: {
  projectId: number;
  onUploaded: () => void;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const notify = useToast();
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    if (file.size > MAX_SCREENSHOT_BYTES) {
      notify(t("validation.imageTooLarge"), "error");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api(`/api/projects/${projectId}/screenshot`, { method: "POST", formData: form });
      notify(result.message || t("common.saved"));
      onUploaded();
    } catch (error) {
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const label = t("projects.uploadScreenshot");
  return (
    <label
      title={compact ? label : undefined}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors focus-within:ring-2 focus-within:ring-accent-line",
        compact
          ? "size-8 text-muted hover:bg-subtle hover:text-ink"
          : "h-8 gap-1.5 border border-line bg-surface px-3 text-[13px] font-semibold text-ink-2 hover:bg-subtle",
        busy && "pointer-events-none opacity-60",
        className,
      )}
    >
      {busy ? <Spinner /> : <ImagePlus className="size-4" aria-hidden="true" />}
      <span className={compact ? "sr-only" : undefined}>{label}</span>
      <input
        type="file"
        accept={SCREENSHOT_ACCEPT}
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared, so picking the same file again uploads it again.
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
    </label>
  );
}
