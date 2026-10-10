"use client";

import { CheckCheck, Flag, FlagOff, LogOut, MonitorSmartphone, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { Translator } from "@/shared/i18n/translate";
import { api } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/ui/cn";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { Menu } from "@/shared/ui/menu";
import { useToast } from "@/shared/ui/toast";
import { SignInDrawer } from "./drawers/sign-in-drawer";
import { needsCheck, placeKeyOf, type MapSignIn } from "./map-types";
import { BrowserMark, Freshness, ProviderAvatar, browserLabel, shortDate } from "./ui";

/** Where a sign-in is, short: "Chrome · Work", "Gmail app" or "On the device". */
export function placeLabel(row: Pick<MapSignIn, "profile" | "app">, t: Translator): string {
  if (row.profile) return `${browserLabel(row.profile.browser, t)} · ${row.profile.name}`;
  if (row.app) return row.app;
  return t("signIns.deviceItself");
}

export function PlaceIcon({ row }: { row: Pick<MapSignIn, "profile"> }) {
  if (row.profile) return <BrowserMark browser={row.profile.browser} color={row.profile.color} />;
  return (
    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2">
      <MonitorSmartphone className="size-4" />
    </span>
  );
}

type Pending = { kind: "signOut" | "delete"; row: MapSignIn } | null;

/** Actions on sign-ins (confirm, sign out, review mark, edit, delete) with their dialogs; `onChanged` reloads. */
export function useSignInActions(onChanged: () => void) {
  const { t } = useI18n();
  const notify = useToast();
  const [pending, setPending] = useState<Pending>(null);
  const [editing, setEditing] = useState<MapSignIn | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => {
    setBusy(true);
    try {
      const result = await api(path, { method, body });
      notify(result.message || t("common.saved"));
      onChanged();
      return true;
    } catch (error) {
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const actions = {
    confirm: (row: MapSignIn) => void run(`/api/sign-ins/${row.id}/confirm`, "POST"),
    toggleReview: (row: MapSignIn) => void run(`/api/sign-ins/${row.id}`, "PATCH", { review: !row.review }),
    askSignOut: (row: MapSignIn) => setPending({ kind: "signOut", row }),
    askDelete: (row: MapSignIn) => setPending({ kind: "delete", row }),
    edit: (row: MapSignIn) => setEditing(row),
  };

  const finishPending = async () => {
    if (!pending) return;
    const ok =
      pending.kind === "signOut"
        ? await run(`/api/sign-ins/${pending.row.id}/sign-out`, "POST")
        : await run(`/api/sign-ins/${pending.row.id}`, "DELETE");
    if (ok) setPending(null);
  };

  const dialogs: ReactNode = (
    <>
      <ConfirmDialog
        open={pending !== null}
        tone={pending?.kind === "delete" ? "danger" : "primary"}
        title={pending?.kind === "delete" ? t("signIns.deleteTitle") : t("signIns.signOutTitle")}
        description={
          pending
            ? t(pending.kind === "delete" ? "signIns.deleteBody" : "signIns.signOutBody", { account: pending.row.account.identifier, place: `${placeLabel(pending.row, t)} — ${pending.row.device.name}` })
            : undefined
        }
        confirmLabel={pending?.kind === "delete" ? t("common.delete") : t("signIns.signOut")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={() => void finishPending()}
        onCancel={() => setPending(null)}
      />
      {editing ? (
        <SignInDrawer
          edit={{
            id: editing.id,
            account: { id: editing.account.id, identifier: editing.account.identifier, label: editing.account.label, provider: editing.provider },
            deviceId: editing.device.id,
            place: placeKeyOf(editing),
            app: editing.app,
            since: editing.since,
            review: editing.review,
            notes: editing.notes,
          }}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
    </>
  );

  return { actions, dialogs };
}

export type SignInActions = ReturnType<typeof useSignInActions>["actions"];

/**
 * One sign-in as a line. `show` decides what it names: the account (inside a place), the place (inside an
 * account) or both (lists across the workspace).
 */
export function SignInLine({
  row,
  show,
  staleBefore,
  actions,
  canWrite,
  selected,
  onSelect,
  href,
  compact = false,
}: {
  row: MapSignIn;
  show: "account" | "place" | "both";
  staleBefore: string;
  actions: SignInActions;
  canWrite: boolean;
  selected?: boolean;
  onSelect?: () => void;
  href?: string;
  /** Narrow columns: the status goes under the name and every action into the menu. */
  compact?: boolean;
}) {
  const { t, format } = useI18n();
  const active = row.status === "signed_in";
  const stale = needsCheck(row, staleBefore) && !row.review;
  const status = active ? (
    <>
      {row.review ? (
        <Badge tone="warn">
          <Flag className="size-3" />
          {t("signIns.markedForReview")}
        </Badge>
      ) : null}
      <Freshness lastVerifiedAt={row.lastVerifiedAt} stale={stale} />
    </>
  ) : (
    <span className="text-xs text-faint">{row.signedOutAt ? t("signIns.signedOutOn", { date: shortDate(row.signedOutAt, format) }) : t("signIns.signedOutStatus")}</span>
  );
  // On phones (and in compact lines) the status sits under the name instead of in its own column.
  const inlineStatus = <span className={cn("mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1", !compact && "sm:hidden")}>{status}</span>;
  const main =
    show === "place" ? (
      <>
        <PlaceIcon row={row} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{placeLabel(row, t)}</span>
          <span className="block truncate text-xs text-muted">{row.device.name}</span>
          {inlineStatus}
        </span>
      </>
    ) : (
      <>
        <ProviderAvatar provider={row.provider} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[13px] font-semibold text-ink">{row.account.identifier}</span>
          <span className="block truncate text-xs text-muted">
            {[row.provider.name, row.account.label, show === "both" ? `${placeLabel(row, t)} — ${row.device.name}` : null].filter(Boolean).join(" · ")}
          </span>
          {inlineStatus}
        </span>
      </>
    );
  const body = (
    <>
      {main}
      {compact ? null : <span className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">{status}</span>}
    </>
  );
  const rowClass = cn(
    "group flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
    selected ? "bg-accent-soft" : "hover:bg-subtle",
    !active && "opacity-70",
  );
  return (
    <div className="flex items-center gap-1">
      {href ? (
        <Link href={href} className={rowClass}>
          {body}
        </Link>
      ) : onSelect ? (
        <button type="button" onClick={onSelect} className={rowClass} aria-pressed={selected}>
          {body}
        </button>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
      {canWrite && active ? (
        <div className="flex shrink-0 items-center">
          {compact ? null : (
            <button
              type="button"
              onClick={() => actions.confirm(row)}
              aria-label={t("signIns.confirm")}
              title={t("signIns.confirm")}
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-ok-soft hover:text-ok-ink"
            >
              <CheckCheck className="size-4" />
            </button>
          )}
          <Menu
            label={t("common.more")}
            items={[
              { label: t("signIns.confirm"), icon: CheckCheck, hidden: !compact, onSelect: () => actions.confirm(row) },
              { label: t("signIns.signOut"), icon: LogOut, onSelect: () => actions.askSignOut(row) },
              { label: row.review ? t("signIns.clearReview") : t("signIns.markReview"), icon: row.review ? FlagOff : Flag, onSelect: () => actions.toggleReview(row) },
              { label: t("common.edit"), icon: Pencil, onSelect: () => actions.edit(row) },
              { label: t("common.delete"), icon: Trash2, tone: "danger", onSelect: () => actions.askDelete(row) },
            ]}
          />
        </div>
      ) : canWrite ? (
        <Menu label={t("common.more")} items={[{ label: t("common.delete"), icon: Trash2, tone: "danger", onSelect: () => actions.askDelete(row) }]} />
      ) : null}
    </div>
  );
}
