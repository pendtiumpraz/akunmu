"use client";

import { ArrowLeft, Boxes, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/shared/ui/feedback";
import { Menu } from "@/shared/ui/menu";
import { useToast } from "@/shared/ui/toast";
import { useApi } from "@/shared/ui/use-api";
import { useStaff } from "../app-shell";
import { ProviderDrawer, type ProviderDraft } from "../drawers/provider-drawer";
import type { ProviderItem } from "../map-types";
import { ProviderAvatar } from "../ui";

type Pending = { kind: "delete" | "restore"; provider: ProviderItem } | null;

/** Providers as tiles (CRUD in one page): built-in ones and the workspace's own; trash with restore. */
export function ProvidersManager() {
  const { t, format } = useI18n();
  const { can } = useStaff();
  const notify = useToast();
  const canWrite = can("map.write");
  const [trashed, setTrashed] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ProviderDraft | null | undefined>(undefined);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const list = useApi<ProviderItem[]>(trashed ? "/api/providers/trashed" : "/api/providers");

  const needle = search.trim().toLowerCase();
  const providers = (list.data ?? []).filter((provider) => !needle || provider.name.toLowerCase().includes(needle) || provider.domain?.includes(needle));
  const used = providers.filter((provider) => provider.accountCount > 0);
  const unused = providers.filter((provider) => provider.accountCount === 0);

  const finish = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const result =
        pending.kind === "delete"
          ? await api(`/api/providers/${pending.provider.id}`, { method: "DELETE" })
          : await api(`/api/providers/${pending.provider.id}/restore`, { method: "PATCH" });
      notify(result.message);
      setPending(null);
      list.reload();
    } catch (error) {
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const tile = (provider: ProviderItem) => (
    <li key={provider.id} className="flex items-center gap-3 rounded-panel border border-line bg-surface p-3">
      <ProviderAvatar provider={provider} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-bold text-ink">
          {provider.name}
          {provider.builtIn ? <Badge>{t("providers.builtIn")}</Badge> : null}
        </p>
        <p className="truncate font-mono text-xs text-muted">{provider.domain ?? "—"}</p>
      </div>
      {trashed ? (
        canWrite ? (
          <Button variant="secondary" size="sm" icon={<RotateCcw className="size-4" />} onClick={() => setPending({ kind: "restore", provider })}>
            {t("common.restore")}
          </Button>
        ) : null
      ) : (
        <>
          {provider.accountCount > 0 ? (
            <Link href={`/app/accounts?provider=${provider.id}`} className="shrink-0 rounded-md bg-sunken px-2 py-0.5 font-mono text-xs font-semibold text-ink-2 hover:text-ink">
              {t("providers.accountCount", { count: format.number(provider.accountCount) })}
            </Link>
          ) : null}
          {canWrite ? (
            <Menu
              label={t("common.more")}
              items={[
                { label: t("common.edit"), icon: Pencil, onSelect: () => setEditing({ id: provider.id, name: provider.name, domain: provider.domain, color: provider.color }) },
                { label: t("common.delete"), icon: Trash2, tone: "danger", hidden: provider.accountCount > 0, onSelect: () => setPending({ kind: "delete", provider }) },
              ]}
            />
          ) : null}
        </>
      )}
    </li>
  );

  return (
    <>
      <PageHeader
        title={trashed ? t("providers.trashTitle") : t("nav.providers")}
        description={trashed ? t("providers.trashHint") : t("providers.listHint")}
        actions={
          <>
            <Button variant={trashed ? "secondary" : "ghost"} icon={trashed ? <ArrowLeft className="size-4" /> : <Trash2 className="size-4" />} onClick={() => setTrashed((value) => !value)}>
              {trashed ? t("common.backToList") : t("common.trash")}
            </Button>
            {!trashed && canWrite ? (
              <Button icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>
                {t("providers.addTitle")}
              </Button>
            ) : null}
          </>
        }
      />
      <label className="relative mb-4 block max-w-sm">
        <span className="sr-only">{t("common.search")}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("providers.searchPlaceholder")}
          className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft"
        />
      </label>
      {list.error && !list.data ? (
        <ErrorState title={t("common.loadFailed")} description={t("common.loadFailedHint")} retryLabel={t("common.retry")} onRetry={list.reload} />
      ) : !list.data ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface">
          <EmptyState icon={<Boxes className="size-5" />} title={trashed ? t("providers.trashEmpty") : t("common.noResults")} />
        </div>
      ) : trashed ? (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{providers.map(tile)}</ul>
      ) : (
        <div className="space-y-6">
          {used.length > 0 ? (
            <section>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">{t("providers.inUse")}</h2>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{used.map(tile)}</ul>
            </section>
          ) : null}
          {unused.length > 0 ? (
            <section>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">{t("providers.available")}</h2>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{unused.map(tile)}</ul>
            </section>
          ) : null}
        </div>
      )}
      {editing !== undefined ? (
        <ProviderDrawer
          provider={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            list.reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={pending !== null}
        tone={pending?.kind === "restore" ? "primary" : "danger"}
        title={pending?.kind === "restore" ? t("providers.restoreTitle") : t("providers.deleteTitle")}
        description={pending ? t(pending.kind === "restore" ? "providers.restoreBody" : "providers.deleteBody", { name: pending.provider.name }) : undefined}
        confirmLabel={pending?.kind === "restore" ? t("common.restore") : t("common.delete")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={() => void finish()}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
