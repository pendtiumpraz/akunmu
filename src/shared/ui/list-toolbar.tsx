"use client";

import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n/client";
import { Button } from "./button";

/** Search box, trash toggle and create button shown above every CRUD table. */
export function ListToolbar({
  search,
  onSearch,
  placeholder,
  trashed,
  onToggleTrash,
  createLabel,
  onCreate,
  extra,
}: {
  search?: string;
  onSearch?: (value: string) => void;
  placeholder?: string;
  trashed: boolean;
  onToggleTrash: () => void;
  createLabel?: string;
  onCreate?: () => void;
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3 border-b border-line px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {onSearch ? (
          <label className="relative w-full md:max-w-xs">
            <span className="sr-only">{t("common.search")}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder={placeholder ?? t("common.search")}
              className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
            />
          </label>
        ) : null}
        {extra}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant={trashed ? "secondary" : "ghost"} size="md" onClick={onToggleTrash} icon={trashed ? <ArrowLeft className="size-4" /> : <Trash2 className="size-4" />}>
          {trashed ? t("common.backToList") : t("common.trash")}
        </Button>
        {!trashed && onCreate && createLabel ? (
          <Button onClick={onCreate} icon={<Plus className="size-4" />}>
            {createLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
