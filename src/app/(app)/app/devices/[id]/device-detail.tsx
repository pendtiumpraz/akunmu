"use client";

import { ArrowLeft, CheckCheck, History, MonitorSmartphone, Pencil, Plus, SquareTerminal, Trash2, TreeDeciduous, Waypoints } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isCliTool } from "@/modules/devices/types";
import { api, type ApiClientError } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Badge } from "@/shared/ui/badge";
import { Button, IconButton } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { ConfirmDialog } from "@/shared/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/shared/ui/feedback";
import { Menu } from "@/shared/ui/menu";
import { useToast } from "@/shared/ui/toast";
import { useApi } from "@/shared/ui/use-api";
import { useStaff } from "../../app-shell";
import { DeviceDrawer } from "../../drawers/device-drawer";
import { ProfileDrawer, type ProfileDraft } from "../../drawers/profile-drawer";
import { SignInDrawer } from "../../drawers/sign-in-drawer";
import { placeKeyOf, type DeviceDetail, type MapSignIn, type PlaceKey } from "../../map-types";
import { SignInLine, placeLabel, useSignInActions } from "../../sign-in-actions";
import { DeviceIcon, ProfileMark, kindLabel, profileClientLabel, systemLabel } from "../../ui";

type DrawerState = { kind: "device" } | { kind: "profile"; profile: ProfileDraft | null; cli: boolean } | { kind: "signIn"; place: PlaceKey | null } | null;
type Pending = { kind: "device" } | { kind: "profile"; id: number; name: string; cli: boolean } | null;
type DeviceProfile = DeviceDetail["profiles"][number];

/**
 * One device: its browser profiles and command-line profiles (several Claude Code accounts, one folder each) with the
 * accounts in each, what is signed in on the device itself, and history.
 */
export function DeviceDetailView({ deviceId }: { deviceId: number }) {
  const { t, format } = useI18n();
  const { can } = useStaff();
  const notify = useToast();
  const router = useRouter();
  const canWrite = can("map.write");
  const detail = useApi<DeviceDetail>(`/api/devices/${deviceId}`);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const { actions, dialogs } = useSignInActions(detail.reload);

  if (detail.error && !detail.data) {
    const missing = (detail.error as ApiClientError).status === 404;
    return (
      <ErrorState
        title={missing ? t("devices.notFound") : t("common.loadFailed")}
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

  const device = detail.data;
  const staleBefore = device.staleBefore;
  const active = (rows: MapSignIn[]) => rows.filter((row) => row.status === "signed_in");
  const history = [...device.profiles.flatMap((profile) => profile.signIns), ...device.onDevice]
    .filter((row) => row.status === "signed_out")
    .sort((a, b) => (b.signedOutAt ?? "").localeCompare(a.signedOutAt ?? ""));
  const onDevice = active(device.onDevice);
  const appGroups = [...new Set(onDevice.map((row) => placeKeyOf(row)))].map((key) => ({ key, rows: onDevice.filter((row) => placeKeyOf(row) === key) }));
  const browserProfiles = device.profiles.filter((profile) => !isCliTool(profile.browser));
  // Commands with an account signed in first, then those still waiting for a login (each group by name).
  const cliProfiles = device.profiles
    .filter((profile) => isCliTool(profile.browser))
    .sort((a, b) => Number(active(a.signIns).length === 0) - Number(active(b.signIns).length === 0));
  // Phones and tablets get the command-line section only once they have such a profile.
  const showCli = cliProfiles.length > 0 || !["phone", "tablet"].includes(device.kind);

  const profileCard = (profile: DeviceProfile) => {
    const rows = active(profile.signIns);
    const cli = isCliTool(profile.browser);
    // A command nobody signed in to yet is just its header: many of them stay short on one screen.
    const waiting = cli && rows.length === 0;
    return (
      <section key={profile.id} className={cn("min-w-0 rounded-panel border bg-surface", waiting ? "border-dashed border-line-strong" : "border-line")}>
        <header className={cn("flex items-center gap-3 px-3 py-2.5", !waiting && "border-b border-line")}>
          <ProfileMark client={profile.browser} color={profile.color} />
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-sm font-bold text-ink", cli && "font-mono")}>{profile.name}</p>
            <p className="truncate text-xs text-muted">
              {[profileClientLabel(profile.browser, t), cli ? profile.directory : null, profile.notes].filter(Boolean).join(" · ")}
            </p>
          </div>
          {waiting ? (
            <span title={t("profiles.cliNoAccount")}>
              <Badge>{t("connect.cliSignedOut")}</Badge>
            </span>
          ) : null}
          {canWrite ? (
            <>
              <IconButton label={t("signIns.recordShort")} onClick={() => setDrawer({ kind: "signIn", place: `p:${profile.id}` })}>
                <Plus className="size-4" />
              </IconButton>
              <Menu
                label={t("common.more")}
                items={[
                  {
                    label: t("common.edit"),
                    icon: Pencil,
                    onSelect: () =>
                      setDrawer({
                        kind: "profile",
                        cli,
                        profile: {
                          id: profile.id,
                          browser: profile.browser,
                          name: profile.name,
                          color: profile.color,
                          syncAccountId: profile.syncAccountId,
                          notes: profile.notes,
                          directory: profile.directory,
                        },
                      }),
                  },
                  {
                    label: cli ? t("profiles.deleteCliTitle") : t("profiles.deleteTitle"),
                    icon: Trash2,
                    tone: "danger",
                    onSelect: () => setPending({ kind: "profile", id: profile.id, name: profile.name, cli }),
                  },
                ]}
              />
            </>
          ) : null}
        </header>
        {waiting ? null : (
          <div className="space-y-0.5 p-1.5">
            {rows.length === 0 ? (
              <p className="px-2.5 py-3 text-xs text-muted">{t("map.placeEmpty")}</p>
            ) : (
              rows.map((row) => <SignInLine key={row.id} row={row} show="account" staleBefore={staleBefore} actions={actions} canWrite={canWrite} href={`/app/accounts/${row.account.id}`} />)
            )}
          </div>
        )}
      </section>
    );
  };

  const post = async (path: string, method: "POST" | "DELETE") => {
    setBusy(true);
    try {
      const result = await api(path, { method });
      notify(result.message);
      return true;
    } catch (error) {
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const finishPending = async () => {
    if (!pending) return;
    if (pending.kind === "device") {
      if (await post(`/api/devices/${device.id}`, "DELETE")) router.push("/app/devices");
      return;
    }
    if (await post(`/api/profiles/${pending.id}`, "DELETE")) {
      setPending(null);
      detail.reload();
    }
  };

  return (
    <>
      <Link href="/app/devices" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        {t("nav.devices")}
      </Link>
      <header className="mb-5 flex flex-wrap items-start gap-4">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-sunken text-ink-2">
          <DeviceIcon kind={device.kind} className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold tracking-tight text-ink">{device.name}</h1>
          <p className="text-[13px] text-muted">{[kindLabel(device.kind, t), systemLabel(device.system, t), device.location].filter(Boolean).join(" · ")}</p>
          <p className="mt-1 text-xs text-faint">
            {device.lastCheckedAt ? t("devices.lastChecked", { when: format.relativeDays(device.lastCheckedAt) }) : t("devices.neverChecked")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/app?tree=device-${device.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-ink-2 hover:bg-subtle">
            <TreeDeciduous className="size-4" />
            {t("devices.showTree")}
          </Link>
          <Link href={`/app?device=${device.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-ink-2 hover:bg-subtle">
            <Waypoints className="size-4" />
            {t("devices.openInMap")}
          </Link>
          {canWrite ? (
            <>
              <Button
                variant="secondary"
                icon={<CheckCheck className="size-4" />}
                loading={busy && pending === null}
                onClick={async () => {
                  if (await post(`/api/devices/${device.id}/check`, "POST")) detail.reload();
                }}
              >
                {t("devices.checkAll")}
              </Button>
              <Button icon={<Plus className="size-4" />} onClick={() => setDrawer({ kind: "signIn", place: null })}>
                {t("signIns.recordButton")}
              </Button>
              <Menu
                label={t("common.more")}
                items={[
                  { label: t("common.edit"), icon: Pencil, onSelect: () => setDrawer({ kind: "device" }) },
                  { label: t("devices.deleteTitle"), icon: Trash2, tone: "danger", onSelect: () => setPending({ kind: "device" }) },
                ]}
              />
            </>
          ) : null}
        </div>
      </header>
      {device.notes ? <p className="mb-5 whitespace-pre-line rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-2">{device.notes}</p> : null}

      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">{t("map.groupProfiles")}</h2>
        {canWrite ? (
          <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setDrawer({ kind: "profile", profile: null, cli: false })}>
            {t("profiles.addTitle")}
          </Button>
        ) : null}
      </div>
      {browserProfiles.length === 0 ? (
        <div className="mb-6 rounded-panel border border-dashed border-line-strong bg-surface">
          <EmptyState title={t("map.noProfiles")} description={t("profiles.emptyHint")} />
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">{browserProfiles.map(profileCard)}</div>
      )}

      {showCli ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">
              {t("profiles.groupCli")}
              {cliProfiles.length > 0 ? <span className="ml-2 text-xs font-semibold text-faint">{cliProfiles.length}</span> : null}
            </h2>
            {canWrite ? (
              <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setDrawer({ kind: "profile", profile: null, cli: true })}>
                {t("profiles.addCliTitle")}
              </Button>
            ) : null}
          </div>
          {cliProfiles.length === 0 ? (
            <div className="mb-6 rounded-panel border border-dashed border-line-strong bg-surface">
              <EmptyState icon={<SquareTerminal className="size-5" />} title={t("profiles.cliEmpty")} description={t("profiles.cliEmptyHint")} />
            </div>
          ) : (
            <div className="mb-6 grid grid-cols-1 items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">{cliProfiles.map(profileCard)}</div>
          )}
        </>
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">{t("map.groupOnDevice")}</h2>
        {canWrite ? (
          <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setDrawer({ kind: "signIn", place: "d" })}>
            {t("signIns.recordShort")}
          </Button>
        ) : null}
      </div>
      <section className="mb-6 rounded-panel border border-line bg-surface">
        {appGroups.length === 0 ? (
          <EmptyState icon={<MonitorSmartphone className="size-5" />} title={t("map.noApps")} description={t("devices.onDeviceHint")} />
        ) : (
          <div className="divide-y divide-line">
            {appGroups.map((group) => (
              <div key={group.key} className="p-1.5">
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">{placeLabel(group.rows[0], t)}</p>
                {group.rows.map((row) => (
                  <SignInLine key={row.id} row={row} show="account" staleBefore={staleBefore} actions={actions} canWrite={canWrite} href={`/app/accounts/${row.account.id}`} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {history.length > 0 ? (
        <details className="group rounded-panel border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-ink">
            <History className="size-4 text-muted" />
            {t("devices.history", { count: history.length })}
          </summary>
          <div className="space-y-0.5 border-t border-line p-1.5">
            {history.map((row) => (
              <SignInLine key={row.id} row={row} show="both" staleBefore={staleBefore} actions={actions} canWrite={canWrite} />
            ))}
          </div>
        </details>
      ) : null}

      {dialogs}
      {drawer?.kind === "device" ? (
        <DeviceDrawer
          device={{ id: device.id, name: device.name, kind: device.kind, system: device.system, location: device.location, notes: device.notes, hostname: device.hostname }}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            detail.reload();
          }}
        />
      ) : null}
      {drawer?.kind === "profile" ? (
        <ProfileDrawer
          deviceId={device.id}
          deviceName={device.name}
          profile={drawer.profile}
          cli={drawer.cli}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            detail.reload();
          }}
        />
      ) : null}
      {drawer?.kind === "signIn" ? (
        <SignInDrawer
          deviceId={device.id}
          place={drawer.place}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            detail.reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === "profile" ? (pending.cli ? t("profiles.deleteCliTitle") : t("profiles.deleteTitle")) : t("devices.deleteTitle")}
        description={pending?.kind === "profile" ? t("profiles.deleteBody", { name: pending.name }) : t("devices.deleteBody", { name: device.name })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        loading={busy}
        onConfirm={() => void finishPending()}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
