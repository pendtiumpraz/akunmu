"use client";

import { Pencil, RotateCcw, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { STAFF_ROLES, type StaffRole } from "@/modules/users/roles";
import type { PublicUser } from "@/modules/users/service";
import { api, ApiClientError, firstFieldErrors, type Json } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { LOCALES } from "@/shared/i18n/locales";
import { Badge, STATUS_TONES } from "@/shared/ui/badge";
import { Button, IconButton } from "@/shared/ui/button";
import { Card, PageHeader } from "@/shared/ui/card";
import { cn } from "@/shared/ui/cn";
import { DataTable, Pagination, type Column } from "@/shared/ui/data-table";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { Drawer } from "@/shared/ui/drawer";
import { Alert, EmptyState } from "@/shared/ui/feedback";
import { Field, Input, Select, Switch } from "@/shared/ui/form-controls";
import { ListToolbar } from "@/shared/ui/list-toolbar";
import { useList } from "@/shared/ui/use-list";
import { useToast } from "@/shared/ui/toast";

type UserRow = Json<PublicUser>;
const ROLE_KEYS: Record<StaffRole, { label: string; hint: string }> = {
  admin: { label: "roles.admin", hint: "users.roleAdminHint" },
  editor: { label: "roles.editor", hint: "users.roleEditorHint" },
  viewer: { label: "roles.viewer", hint: "users.roleViewerHint" },
};

type State = { name: string; email: string; role: StaffRole; password: string; locale: string; isActive: boolean };
const empty: State = { name: "", email: "", role: "editor", password: "", locale: "", isActive: true };

/**
 * `apiBase` switches between workspace staff (/api/users) and platform staff (/api/platform/users); inside the
 * settings tabs the page header is left out (`header={false}`).
 */
export function UsersManager({ currentUserEmail, apiBase = "/api/users", header = true }: { currentUserEmail: string; apiBase?: string; header?: boolean }) {
  const { t, format } = useI18n();
  const notify = useToast();
  const list = useList<UserRow>(apiBase, `${apiBase}/trashed`);
  const [drawer, setDrawer] = useState<{ open: boolean; user: UserRow | null }>({ open: false, user: null });
  const [state, setState] = useState<State>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "delete" | "restore"; user: UserRow } | null>(null);
  const [busy, setBusy] = useState(false);

  const openUserDrawer = (user: UserRow | null) => {
    setState(user ? { name: user.name, email: user.email, role: user.role, password: "", locale: user.locale ?? "", isActive: user.isActive } : empty);
    setErrors({});
    setFormError(null);
    setDrawer({ open: true, user });
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    setFormError(null);
    const body = {
      name: state.name,
      email: state.email,
      role: state.role,
      locale: state.locale || null,
      ...(drawer.user ? { isActive: state.isActive } : {}),
      ...(state.password ? { password: state.password } : {}),
    };
    try {
      const { message } = drawer.user ? await api(`${apiBase}/${drawer.user.id}`, { method: "PATCH", body }) : await api(apiBase, { body });
      notify(message);
      setDrawer({ open: false, user: null });
      list.reload();
    } catch (error) {
      setErrors(firstFieldErrors(error));
      setFormError(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"));
    } finally {
      setSaving(false);
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const { message } =
        confirm.kind === "delete"
          ? await api(`${apiBase}/${confirm.user.id}`, { method: "DELETE" })
          : await api(`${apiBase}/${confirm.user.id}/restore`, { method: "PATCH" });
      notify(message);
      setConfirm(null);
      list.reload();
    } catch (error) {
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<UserRow>[] = [
    {
      key: "name",
      header: t("users.columnName"),
      cell: (user) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-bold text-ink-2">
            {user.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>
      ),
    },
    { key: "role", header: t("users.columnRole"), cell: (user) => <Badge tone={STATUS_TONES[user.role]}>{t.dynamic(ROLE_KEYS[user.role].label)}</Badge> },
    {
      key: "status",
      header: t("users.columnStatus"),
      cell: (user) => <Badge tone={user.isActive ? "ok" : "neutral"} dot>{user.isActive ? t("users.statusActive") : t("users.statusInactive")}</Badge>,
      hideOnMobile: true,
    },
    { key: "lastLogin", header: t("users.columnLastLogin"), cell: (user) => <span className="whitespace-nowrap text-ink-2">{user.lastLoginAt ? format.dateTime(user.lastLoginAt) : t("users.never")}</span>, hideOnMobile: true },
    {
      key: "actions",
      header: <span className="sr-only">{t("common.actions")}</span>,
      className: "w-px text-right",
      cell: (user) => (
        <div className="flex justify-end gap-1">
          {list.trashed ? (
            <IconButton label={t("common.restore")} onClick={() => setConfirm({ kind: "restore", user })}>
              <RotateCcw className="size-4 text-ok-ink" />
            </IconButton>
          ) : (
            <>
              <IconButton label={t("common.edit")} onClick={() => openUserDrawer(user)}>
                <Pencil className="size-4" />
              </IconButton>
              {user.email !== currentUserEmail ? (
                <IconButton label={t("common.delete")} onClick={() => setConfirm({ kind: "delete", user })}>
                  <Trash2 className="size-4 text-danger" />
                </IconButton>
              ) : null}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      {header ? <PageHeader title={t("users.title")} description={t("users.subtitle")} /> : null}
      <Card>
        <ListToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder={t("users.searchPlaceholder")}
          trashed={list.trashed}
          onToggleTrash={list.toggleTrash}
          createLabel={t("users.new")}
          onCreate={() => openUserDrawer(null)}
        />
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(user) => user.id}
          loading={list.loading}
          error={Boolean(list.error)}
          onRetry={list.reload}
          empty={
            list.trashed ? (
              <EmptyState icon={<Trash2 className="size-6" />} title={t("common.trashEmpty")} />
            ) : (
              <EmptyState icon={<UserRound className="size-6" />} title={t("users.emptyTitle")} description={t("users.emptyDescription")} />
            )
          }
        />
        {list.data ? <Pagination page={list.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={list.setPage} /> : null}
      </Card>

      <Drawer
        open={drawer.open}
        onClose={() => setDrawer({ open: false, user: null })}
        title={drawer.user ? t("users.edit") : t("users.new")}
        closeLabel={t("common.close")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDrawer({ open: false, user: null })}>
              {t("common.cancel")}
            </Button>
            <Button onClick={save} loading={saving}>
              {drawer.user ? t("common.saveChanges") : t("common.create")}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <Field label={t("users.fieldName")} htmlFor="userName" required error={errors.name}>
            <Input id="userName" value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} invalid={Boolean(errors.name)} />
          </Field>
          <Field label={t("users.fieldEmail")} htmlFor="userEmail" required error={errors.email}>
            <Input id="userEmail" type="email" value={state.email} onChange={(e) => setState({ ...state, email: e.target.value })} invalid={Boolean(errors.email)} />
          </Field>
          <Field label={t("users.fieldRole")} required error={errors.role}>
            <div className="space-y-2">
              {STAFF_ROLES.map((role) => (
                <label
                  key={role}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                    state.role === role ? "border-accent-line bg-accent-soft" : "border-line hover:bg-subtle",
                  )}
                >
                  <input type="radio" name="role" className="mt-1 accent-primary" checked={state.role === role} onChange={() => setState({ ...state, role })} />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{t.dynamic(ROLE_KEYS[role].label)}</span>
                    <span className="block text-xs text-muted">{t.dynamic(ROLE_KEYS[role].hint)}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
          <Field
            label={drawer.user ? t("users.fieldNewPassword") : t("users.fieldPassword")}
            htmlFor="userPassword"
            required={!drawer.user}
            hint={drawer.user ? t("users.fieldNewPasswordHint") : t("users.fieldPasswordHint")}
            error={errors.password}
          >
            <Input id="userPassword" type="password" autoComplete="new-password" value={state.password} onChange={(e) => setState({ ...state, password: e.target.value })} invalid={Boolean(errors.password)} />
          </Field>
          <Field label={t("common.language")} htmlFor="userLocale" optionalLabel={t("common.optional")}>
            <Select id="userLocale" value={state.locale} onChange={(e) => setState({ ...state, locale: e.target.value })}>
              <option value="">{t("common.none")}</option>
              {LOCALES.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.name}
                </option>
              ))}
            </Select>
          </Field>
          {drawer.user ? (
            <Switch id="userActive" checked={state.isActive} onChange={(value) => setState({ ...state, isActive: value })} label={t("users.fieldActive")} description={t("users.fieldActiveHint")} />
          ) : null}
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "restore" ? t("users.restoreTitle") : t("users.deleteTitle")}
        description={confirm?.kind === "restore" ? t("users.restoreBody") : t("users.deleteBody")}
        confirmLabel={confirm?.kind === "restore" ? t("common.restore") : t("common.delete")}
        cancelLabel={t("common.cancel")}
        tone={confirm?.kind === "restore" ? "primary" : "danger"}
        loading={busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
