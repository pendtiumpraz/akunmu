"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n/client";
import { cn } from "./cn";
import { ErrorState, Skeleton } from "./feedback";

export type Column<Row> = {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  className?: string;
  /** Hidden below the md breakpoint to keep tables readable on phones. */
  hideOnMobile?: boolean;
};

/** Table with loading skeleton, error state with retry and an empty state slot. */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  onRowClick,
}: {
  columns: Column<Row>[];
  rows: Row[] | null | undefined;
  rowKey: (row: Row) => string | number;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  empty: ReactNode;
  onRowClick?: (row: Row) => void;
}) {
  const { t } = useI18n();
  if (error) {
    return <ErrorState title={t("common.loadFailed")} description={t("common.loadFailedHint")} retryLabel={t("common.retry")} onRetry={onRetry} />;
  }
  if (loading && !rows?.length) {
    return (
      <div className="space-y-3 p-5" aria-busy="true" aria-label={t("common.loading")}>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (!rows?.length) return <>{empty}</>;

  return (
    <div className={cn("overflow-x-auto", loading && "opacity-60 transition-opacity")}>
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-subtle">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted",
                  column.hideOnMobile && "hidden md:table-cell",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-subtle")}
            >
              {columns.map((column) => (
                <td key={column.key} className={cn("px-5 py-3 align-middle", column.hideOnMobile && "hidden md:table-cell", column.className)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const { t, format } = useI18n();
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-muted">
      <span>{t("common.pageOf", { page: format.number(page), pages: format.number(totalPages), total: format.number(total) })}</span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label={t("common.previous")}
          className="inline-flex size-8 items-center justify-center rounded-lg border border-line bg-surface hover:bg-subtle disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          aria-label={t("common.next")}
          className="inline-flex size-8 items-center justify-center rounded-lg border border-line bg-surface hover:bg-subtle disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
