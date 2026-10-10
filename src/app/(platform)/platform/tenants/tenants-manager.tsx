"use client";

import { Building2, KeyRound, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { TENANT_STATUSES } from "@/modules/tenants/types";
import { api, ApiClientError } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Badge, type BadgeTone } from "@/shared/ui/badge";
import { IconButton } from "@/shared/ui/button";
import { Card, PageHeader } from "@/shared/ui/card";
import { CopyButton } from "@/shared/ui/copy-button";
import { DataTable, Pagination, type Column } from "@/shared/ui/data-table";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/feedback";
import { Select } from "@/shared/ui/form-controls";
import { ListToolbar } from "@/shared/ui/list-toolbar";
import { useList } from "@/shared/ui/use-list";
import { useToast } from "@/shared/ui/toast";
import { TenantDrawer, type CreatedTenant, type TenantRow } from "./tenant-drawer";

const STATUS_TONE: Record<string, BadgeTone> = { trial: "warn", active: "ok", suspended: "danger", cancelled: "neutral" };

/** Platform console: every workspace (tenant), with its status, devices, accounts and staff. */
export function TenantsManager() {
  const { t, format } = useI18n();
  const notify = useToast();
  const [status, setStatus] = useState("");
  const list = useList<TenantRow>("/api/platform/tenants", "/api/platform/tenants/trashed", { status: status || undefined });
  const [drawer, setDrawer] = useState<{ open: boolean; tenant: TenantRow | null }>({ open: false, tenant: null });
  const [confirm, setConfirm] = useState<{ kind: "delete" | "restore"; tenant: TenantRow } | null>(null);
  const [created, setCreated] = useState<CreatedTenant | null>(null);
  const [busy, setBusy] = useState(false);

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const { message } =
        confirm.kind === "delete"
          ? await api(`/api/platform/tenants/${confirm.tenant.id}`, { method: "DELETE" })
          : await api(`/api/platform/tenants/${confirm.tenant.id}/restore`, { method: "PATCH" });
      notify(message);
      setConfirm(null);
      list.reload();
    } catch (error) {
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<TenantRow>[] = [
    {
      key: "organization",
      header: t("platform.columnOrganization"),
      cell: (tenant) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{tenant.name}</p>
          <p className="truncate font-mono text-xs text-muted">{tenant.slug}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: t("platform.columnStatus"),
      cell: (tenant) => (
        <Badge tone={STATUS_TONE[tenant.status]} dot>
          {t.dynamic(`platform.status_${tenant.status}`)}
        </Badge>
      ),
    },
    { key: "devices", header: t("platform.columnDevices"), cell: (tenant) => format.number(tenant.deviceCount), hideOnMobile: true },
    { key: "accounts", header: t("platform.columnAccounts"), cell: (tenant) => format.number(tenant.accountCount), hideOnMobile: true },
    { key: "staff", header: t("platform.columnStaff"), cell: (tenant) => format.number(tenant.staffCount), hideOnMobile: true },
    { key: "created", header: t("platform.columnCreated"), cell: (tenant) => <span className="whitespace-nowrap text-ink-2">{format.date(tenant.createdAt)}</span>, hideOnMobile: true },
    {
      key: "actions",
      header: <span className="sr-only">{t("common.actions")}</span>,
      className: "w-px text-right",
      cell: (tenant) => (
        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          {list.trashed ? (
            <IconButton label={t("common.restore")} onClick={() => setConfirm({ kind: "restore", tenant })}>
              <RotateCcw className="size-4 text-ok-ink" />
            </IconButton>
          ) : (
            <>
              <IconButton label={t("common.edit")} onClick={() => setDrawer({ open: true, tenant })}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton label={t("common.delete")} onClick={() => setConfirm({ kind: "delete", tenant })}>
                <Trash2 className="size-4 text-danger" />
              </IconButton>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title={t("platform.tenantsTitle")} description={t("platform.tenantsSubtitle")} />
      <Card>
        <ListToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder={t("platform.searchTenants")}
          trashed={list.trashed}
          onToggleTrash={list.toggleTrash}
          extra={
            <Select
              value={status}
              onChange={(change) => {
                setStatus(change.target.value);
                list.setPage(1);
              }}
              aria-label={t("platform.fieldStatus")}
              fullWidth={false}
              className="w-full md:w-48"
            >
              <option value="">{t("platform.statusAll")}</option>
              {TENANT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t.dynamic(`platform.status_${value}`)}
                </option>
              ))}
            </Select>
          }
          createLabel={t("platform.newTenant")}
          onCreate={() => setDrawer({ open: true, tenant: null })}
        />
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(tenant) => tenant.id}
          loading={list.loading}
          error={Boolean(list.error)}
          onRetry={list.reload}
          onRowClick={list.trashed ? undefined : (tenant) => setDrawer({ open: true, tenant })}
          empty={
            list.trashed ? (
              <EmptyState icon={<Trash2 className="size-6" />} title={t("common.trashEmpty")} />
            ) : list.search || status ? (
              <EmptyState title={t("common.noResults")} />
            ) : (
              <EmptyState icon={<Building2 className="size-6" />} title={t("platform.emptyTitle")} description={t("platform.emptyBody")} />
            )
          }
        />
        {list.data ? <Pagination page={list.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={list.setPage} /> : null}
      </Card>

      {drawer.open ? (
        <TenantDrawer
          tenant={drawer.tenant}
          onClose={() => setDrawer({ open: false, tenant: null })}
          onSaved={(result) => {
            setDrawer({ open: false, tenant: null });
            list.reload();
            if (result?.temporaryPassword) setCreated(result);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "restore" ? t("platform.restoreTitle") : t("platform.deleteTitle")}
        description={confirm?.kind === "restore" ? t("platform.restoreBody") : t("platform.deleteBody")}
        confirmLabel={confirm?.kind === "restore" ? t("common.restore") : t("common.delete")}
        cancelLabel={t("common.cancel")}
        tone={confirm?.kind === "restore" ? "primary" : "danger"}
        loading={busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={created !== null}
        title={t("platform.passwordTitle")}
        description={
          created ? (
            <span className="block space-y-3">
              <span className="block">{t("platform.passwordBody", { email: created.admin?.email ?? "" })}</span>
              <span className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2 ring-1 ring-line">
                <span className="flex min-w-0 items-center gap-2 font-mono text-sm text-ink">
                  <KeyRound className="size-4 shrink-0 text-accent" />
                  <span className="truncate">{created.temporaryPassword}</span>
                </span>
                <CopyButton value={created.temporaryPassword ?? ""} />
              </span>
            </span>
          ) : null
        }
        confirmLabel={t("common.close")}
        cancelLabel={t("common.close")}
        tone="primary"
        onConfirm={() => setCreated(null)}
        onCancel={() => setCreated(null)}
      />
    </>
  );
}
