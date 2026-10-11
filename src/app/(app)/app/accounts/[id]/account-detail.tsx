"use client";

import { AlertTriangle, ArrowLeft, History, Pencil, Plus, Trash2, TreeDeciduous, Waypoints } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { CopyButton } from "@/shared/ui/copy-button";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/shared/ui/feedback";
import { Menu } from "@/shared/ui/menu";
import { useToast } from "@/shared/ui/toast";
import { useApi } from "@/shared/ui/use-api";
import { TWO_FACTOR_TONES } from "../accounts-manager";
import { useStaff } from "../../app-shell";
import { AccountDrawer, TWO_FACTOR_ICONS } from "../../drawers/account-drawer";
import { SignInDrawer } from "../../drawers/sign-in-drawer";
import { placeKeyOf, type AccountDetail } from "../../map-types";
import { SignInLine, useSignInActions } from "../../sign-in-actions";
import { ProviderAvatar } from "../../ui";

/** One account: everywhere it is signed in (with actions), where it was signed out, and its details. */
export function AccountDetailView({ accountId }: { accountId: number }) {
  const { t } = useI18n();
  const { can } = useStaff();
  const notify = useToast();
  const router = useRouter();
  const canWrite = can("map.write");
  const detail = useApi<AccountDetail>(`/api/accounts/${accountId}`);
  const [drawer, setDrawer] = useState<"account" | "signIn" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const { actions, dialogs } = useSignInActions(detail.reload);

  if (detail.error && !detail.data) {
    const missing = detail.error.status === 404;
    return (
      <ErrorState
        title={missing ? t("accounts.notFound") : t("common.loadFailed")}
        description={missing ? undefined : t("common.loadFailedHint")}
        retryLabel={missing ? undefined : t("common.retry")}
        onRetry={missing ? undefined : detail.reload}
      />
    );
  }
  if (!detail.data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={t("common.loading")}>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const account = detail.data;
  const activeRows = account.signIns.filter((row) => row.status === "signed_in");
  const history = account.signIns.filter((row) => row.status === "signed_out").sort((a, b) => (b.signedOutAt ?? "").localeCompare(a.signedOutAt ?? ""));
  const TwoFactorIcon = TWO_FACTOR_ICONS[account.twoFactor];

  const remove = async () => {
    setBusy(true);
    try {
      const result = await api(`/api/accounts/${account.id}`, { method: "DELETE" });
      notify(result.message);
      router.push("/app/accounts");
    } catch (error) {
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link href="/app/accounts" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        {t("nav.accounts")}
      </Link>
      <header className="mb-5 flex flex-wrap items-start gap-4">
        <ProviderAvatar provider={account.provider} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate font-mono text-lg font-bold text-ink">{account.identifier}</h1>
            <CopyButton value={account.identifier} />
          </div>
          <p className="text-[13px] text-muted">{[account.provider.name, account.label].filter(Boolean).join(" · ")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={TWO_FACTOR_TONES[account.twoFactor]}>
              <TwoFactorIcon className="size-3" />
              {t.dynamic(`accounts.twoFactorLong_${account.twoFactor}`)}
            </Badge>
          </div>
        </div>
        {canWrite ? (
          <div className="flex items-center gap-2">
            <Button icon={<Plus className="size-4" />} onClick={() => setDrawer("signIn")}>
              {t("signIns.recordButton")}
            </Button>
            <Menu
              label={t("common.more")}
              items={[
                { label: t("common.edit"), icon: Pencil, onSelect: () => setDrawer("account") },
                { label: t("accounts.deleteTitle"), icon: Trash2, tone: "danger", onSelect: () => setDeleting(true) },
              ]}
            />
          </div>
        ) : null}
      </header>
      {account.notes ? <p className="mb-5 whitespace-pre-line rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-2">{account.notes}</p> : null}

      <section className="mb-6 rounded-panel border border-line bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-ink">{t("map.signedInPlaces", { count: activeRows.length })}</h2>
            {activeRows.length > 1 ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-warn-ink">
                <AlertTriangle className="size-3.5" />
                {t("map.manyPlacesHint")}
              </p>
            ) : null}
          </div>
          {activeRows.length > 0 ? (
            <div className="flex flex-wrap items-center gap-4">
              <Link href={`/app?tree=account-${account.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline">
                <TreeDeciduous className="size-4" />
                {t("accounts.showTree")}
              </Link>
              <Link
                href={`/app?device=${activeRows[0].device.id}&place=${encodeURIComponent(placeKeyOf(activeRows[0]))}&account=${account.id}`}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
              >
                <Waypoints className="size-4" />
                {t("accounts.showOnMap")}
              </Link>
            </div>
          ) : null}
        </header>
        {activeRows.length === 0 ? (
          <EmptyState icon={<Waypoints className="size-5" />} title={t("accounts.nowhere")} description={t("accounts.nowhereHint")} />
        ) : (
          <div className="space-y-0.5 p-1.5">
            {activeRows.map((row) => (
              <SignInLine
                key={row.id}
                row={row}
                show="place"
                staleBefore={account.staleBefore}
                actions={actions}
                canWrite={canWrite}
                href={`/app?device=${row.device.id}&place=${encodeURIComponent(placeKeyOf(row))}&account=${account.id}`}
              />
            ))}
          </div>
        )}
      </section>

      {history.length > 0 ? (
        <details className="rounded-panel border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-ink">
            <History className="size-4 text-muted" />
            {t("accounts.history", { count: history.length })}
          </summary>
          <div className="space-y-0.5 border-t border-line p-1.5">
            {history.map((row) => (
              <SignInLine key={row.id} row={row} show="place" staleBefore={account.staleBefore} actions={actions} canWrite={canWrite} />
            ))}
          </div>
        </details>
      ) : null}

      {dialogs}
      {drawer === "account" ? (
        <AccountDrawer
          account={{ id: account.id, providerId: account.provider.id, identifier: account.identifier, label: account.label, twoFactor: account.twoFactor, notes: account.notes }}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            detail.reload();
          }}
        />
      ) : null}
      {drawer === "signIn" ? (
        <SignInDrawer
          account={{ id: account.id, identifier: account.identifier, label: account.label, provider: account.provider }}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            detail.reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting}
        title={t("accounts.deleteTitle")}
        description={t("accounts.deleteBody", { account: account.identifier })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}
