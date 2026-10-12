"use client";

import { CheckCheck, ExternalLink, Flag, FlagOff, GitBranch, LogOut, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { isOpenableClient } from "@/modules/connect/types";
import { api } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/ui/cn";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { Menu } from "@/shared/ui/menu";
import { useToast } from "@/shared/ui/toast";
import { useStaff } from "./app-shell";
import { SignInDrawer } from "./drawers/sign-in-drawer";
import { needsCheck, placeKeyOf, type MapSignIn } from "./map-types";
import { AppMark, Freshness, ProfileMark, ProviderAvatar, approvalLabel, placeLabel, shortDate } from "./ui";

export { approvalLabel, placeLabel } from "./ui";

export function PlaceIcon({ row }: { row: Pick<MapSignIn, "profile" | "app" | "appKind"> }) {
  if (row.profile) return <ProfileMark client={row.profile.browser} color={row.profile.color} />;
  return <AppMark kind={row.app ? row.appKind : null} />;
}

type Pending = { kind: "signOut" | "delete"; row: MapSignIn } | null;

type OpenTarget = Pick<MapSignIn, "provider" | "device" | "profile">;

/** "Open in profile" applies to a browser profile AkunMu Desktop can open, on a computer it knows by name. */
export function canOpenInProfile(row: OpenTarget): boolean {
  return Boolean(row.profile && isOpenableClient(row.profile.browser) && row.device.hostname);
}

/** The akunmu:// link the web app hands to AkunMu Desktop, which opens the profile only on the computer named here. */
function desktopLink(row: OpenTarget, url: string | null): string {
  const params = new URLSearchParams({ browser: row.profile?.browser ?? "chrome", profile: row.profile?.name ?? "" });
  if (row.profile?.directory) params.set("directory", row.profile.directory);
  if (row.device.hostname) params.set("host", row.device.hostname);
  if (url) params.set("url", url);
  return `akunmu://open?${params.toString()}`;
}

/** Actions on sign-ins (confirm, sign out, review mark, edit, delete) with their dialogs; `onChanged` reloads. */
export function useSignInActions(onChanged: () => void) {
  const { t } = useI18n();
  const { desktop } = useStaff();
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

  /** Opens the provider's site in the sign-in's browser profile: directly in the desktop app, else through it. */
  const openInProfile = async (row: MapSignIn) => {
    if (!row.profile) return;
    const url = row.provider.domain ? `https://${row.provider.domain}` : null;
    if (!desktop) {
      window.location.assign(desktopLink(row, url));
      notify(t("signIns.openSent"));
      return;
    }
    try {
      const result = await api("/api/desktop/open", { method: "POST", body: { profileId: row.profile.id, url } });
      notify(result.message);
    } catch (error) {
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
    }
  };

  const actions = {
    openInProfile: (row: MapSignIn) => void openInProfile(row),
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
            appKind: editing.appKind,
            approvedFromId: editing.approvedFromId,
            approvalMethod: editing.approvalMethod,
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
  const grewVia = row.approvedFromId ? (
    <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-accent">
      <GitBranch className="size-3" />
      {t("signIns.grewVia", { how: approvalLabel(row.approvalMethod, t) })}
    </span>
  ) : null;
  const main =
    show === "place" ? (
      <>
        <PlaceIcon row={row} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{placeLabel(row, t)}</span>
          <span className="block truncate text-xs text-muted">{row.device.name}</span>
          {grewVia}
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
          {grewVia}
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
              { label: t("signIns.openInProfile"), icon: ExternalLink, hidden: !canOpenInProfile(row), onSelect: () => actions.openInProfile(row) },
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
