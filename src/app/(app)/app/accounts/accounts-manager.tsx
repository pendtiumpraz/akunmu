"use client";

import { AtSign, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Badge, type BadgeTone } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, PageHeader } from "@/shared/ui/card";
import { DataTable, Pagination, type Column } from "@/shared/ui/data-table";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/feedback";
import { Select } from "@/shared/ui/form-controls";
import { ListToolbar } from "@/shared/ui/list-toolbar";
import { useToast } from "@/shared/ui/toast";
import { useApi } from "@/shared/ui/use-api";
import { useList } from "@/shared/ui/use-list";
import { useStaff } from "../app-shell";
import { AccountDrawer, TWO_FACTOR_ICONS } from "../drawers/account-drawer";
import type { AccountListItem, ProviderItem } from "../map-types";
import { ProviderAvatar } from "../ui";

export const TWO_FACTOR_TONES: Record<string, BadgeTone> = { on: "ok", off: "warn", unknown: "neutral" };

/** Accounts table (CRUD in one page): search, provider filter, add, trash with restore; a row opens the account. */
export function AccountsManager({ initialProvider }: { initialProvider: string }) {
  const { t, format } = useI18n();
  const { can } = useStaff();
  const notify = useToast();
  const router = useRouter();
  const canWrite = can("map.write");
  const [providerId, setProviderId] = useState(initialProvider);
  const list = useList<AccountListItem>("/api/accounts", "/api/accounts/trashed", { provider: providerId || undefined });
  const providers = useApi<ProviderItem[]>("/api/providers");
  const [adding, setAdding] = useState(false);
  const [restoring, setRestoring] = useState<AccountListItem | null>(null);
  const [busy, setBusy] = useState(false);

  const restore = async () => {
    if (!restoring) return;
    setBusy(true);
    try {
      const result = await api(`/api/accounts/${restoring.id}/restore`, { method: "PATCH" });
      notify(result.message);
      setRestoring(null);
      list.reload();
    } catch (error) {
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<AccountListItem>[] = [
    {
      key: "account",
      header: t("accounts.columnAccount"),
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <ProviderAvatar provider={row.provider} />
          <div className="min-w-0">
            <p className="truncate font-mono text-[13px] font-semibold text-ink">{row.identifier}</p>
            <p className="truncate text-xs text-muted">{[row.provider.name, row.label].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
      ),
    },
    {
      key: "twoFactor",
      header: t("accounts.fieldTwoFactor"),
      hideOnMobile: true,
      cell: (row) => {
        const Icon = TWO_FACTOR_ICONS[row.twoFactor];
        return (
          <Badge tone={TWO_FACTOR_TONES[row.twoFactor]}>
            <Icon className="size-3" />
            {t.dynamic(`accounts.twoFactor_${row.twoFactor}`)}
          </Badge>
        );
      },
    },
    {
      key: "places",
      header: t("accounts.columnPlaces"),
      className: "text-right",
      cell: (row) =>
        list.trashed ? (
          <span className="text-xs text-muted">{row.deletedAt ? format.date(row.deletedAt) : ""}</span>
        ) : (
          <span className={row.activeSignIns > 0 ? "font-mono text-sm font-bold text-ink" : "font-mono text-sm text-faint"}>{format.number(row.activeSignIns)}</span>
        ),
    },
    ...(list.trashed && canWrite
      ? [
          {
            key: "restore",
            header: "",
            className: "w-28 text-right",
            cell: (row: AccountListItem) => (
              <Button
                variant="secondary"
                size="sm"
                icon={<RotateCcw className="size-4" />}
                onClick={(event) => {
                  event.stopPropagation();
                  setRestoring(row);
                }}
              >
                {t("common.restore")}
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader title={list.trashed ? t("accounts.trashTitle") : t("nav.accounts")} description={list.trashed ? t("accounts.trashHint") : t("accounts.listHint")} />
      <Card>
        <ListToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder={t("accounts.searchPlaceholder")}
          trashed={list.trashed}
          onToggleTrash={list.toggleTrash}
          createLabel={canWrite ? t("accounts.addTitle") : undefined}
          onCreate={canWrite ? () => setAdding(true) : undefined}
          extra={
            <Select
              fullWidth={false}
              value={providerId}
              onChange={(event) => {
                setProviderId(event.target.value);
                list.setPage(1);
              }}
              aria-label={t("accounts.fieldProvider")}
            >
              <option value="">{t("accounts.allProviders")}</option>
              {(providers.data ?? [])
                .filter((provider) => provider.accountCount > 0)
                .map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
            </Select>
          }
        />
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(row) => row.id}
          loading={list.loading}
          error={Boolean(list.error)}
          onRetry={list.reload}
          onRowClick={list.trashed ? undefined : (row) => router.push(`/app/accounts/${row.id}`)}
          empty={
            <EmptyState
              icon={<AtSign className="size-5" />}
              title={list.trashed ? t("accounts.trashEmpty") : list.search ? t("common.noResults") : t("accounts.empty")}
              description={list.trashed || list.search ? undefined : t("accounts.emptyHint")}
            />
          }
        />
        {list.data ? <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={list.setPage} /> : null}
      </Card>
      {adding ? (
        <AccountDrawer
          account={null}
          onClose={() => setAdding(false)}
          onSaved={(saved) => {
            setAdding(false);
            router.push(`/app/accounts/${saved.id}`);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={restoring !== null}
        tone="primary"
        title={t("accounts.restoreTitle")}
        description={restoring ? t("accounts.restoreBody", { account: restoring.identifier }) : undefined}
        confirmLabel={t("common.restore")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={() => void restore()}
        onCancel={() => setRestoring(null)}
      />
    </>
  );
}
