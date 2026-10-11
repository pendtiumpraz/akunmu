"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CheckCheck,
  ChevronRight,
  Laptop,
  ListChecks,
  Pencil,
  Plus,
  Sparkles,
  TreeDeciduous,
  Waypoints,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { AppKind } from "@/modules/signins/types";
import { api } from "@/shared/http/client";
import type { Translator } from "@/shared/i18n/translate";
import { useI18n } from "@/shared/i18n/client";
import { Button, ButtonLink, IconButton } from "@/shared/ui/button";
import { CountUp } from "@/shared/ui/count-up";
import { cn } from "@/shared/ui/cn";
import { EmptyState, ErrorState, Skeleton } from "@/shared/ui/feedback";
import { Segmented } from "@/shared/ui/form-controls";
import { Menu } from "@/shared/ui/menu";
import { useToast } from "@/shared/ui/toast";
import { useApi } from "@/shared/ui/use-api";
import { useStaff } from "./app-shell";
import { DeviceDrawer, type DeviceDraft } from "./drawers/device-drawer";
import { ProfileDrawer } from "./drawers/profile-drawer";
import { SignInDrawer, type FixedAccount } from "./drawers/sign-in-drawer";
import { needsCheck, placeKeyOf, type MapData, type MapDevice, type MapProfile, type PlaceKey, type TreeData } from "./map-types";
import { SignInLine, useSignInActions } from "./sign-in-actions";
import { TreeCanvas, type TreeFocus } from "./tree/tree-canvas";
import { AppMark, BrowserMark, DeviceIcon, ProviderAvatar, browserLabel, systemLabel } from "./ui";

/** Which view the map opens in: the account trees, the columns (device → place → account) or the list to check. */
export type MapView = "tree" | "map" | "check";

export type MapSelection = { deviceId: number | null; place: PlaceKey | null; accountId: number | null; view: MapView };

type Place = { key: PlaceKey; label: string; detail: string; profile: MapProfile | null; appKind: AppKind | null; count: number; toCheck: number };

type DrawerState =
  | { kind: "device"; device: DeviceDraft | null }
  | { kind: "profile" }
  | { kind: "signIn"; deviceId: number | null; place: PlaceKey | null; account: FixedAccount | null }
  | null;

function urlFor(selection: MapSelection): string {
  const params = new URLSearchParams();
  if (selection.view === "check") params.set("view", "check");
  if (selection.view === "map") {
    params.set("view", "columns");
    if (selection.deviceId) params.set("device", String(selection.deviceId));
    if (selection.place) params.set("place", selection.place);
    if (selection.accountId) params.set("account", String(selection.accountId));
  }
  const query = params.toString();
  return query ? `/app?${query}` : "/app";
}

/** The places of a device: its browser profiles, then the apps (and the system) signed in on the device itself. */
function placesOf(device: MapDevice, data: MapData, staleBefore: string, t: Translator): Place[] {
  const rows = data.signIns.filter((row) => row.device.id === device.id);
  const count = (key: PlaceKey) => rows.filter((row) => placeKeyOf(row) === key);
  const profiles: Place[] = data.profiles
    .filter((profile) => profile.deviceId === device.id)
    .map((profile) => {
      const inside = count(`p:${profile.id}`);
      return {
        key: `p:${profile.id}`,
        label: profile.name,
        detail: browserLabel(profile.browser, t),
        profile,
        appKind: null,
        count: inside.length,
        toCheck: inside.filter((row) => needsCheck(row, staleBefore)).length,
      };
    });
  const onDevice = new Map<PlaceKey, string>();
  for (const row of rows) {
    if (row.profile) continue;
    const key = placeKeyOf(row);
    if (!onDevice.has(key)) onDevice.set(key, row.app ?? t("signIns.deviceItself"));
  }
  const apps: Place[] = [...onDevice.entries()]
    .sort(([a], [b]) => (a === "d" ? -1 : b === "d" ? 1 : a.localeCompare(b)))
    .map(([key, label]) => {
      const inside = count(key);
      // A command-line tool shows as one when any of its sign-ins says so.
      const appKind = key === "d" ? null : inside.some((row) => row.appKind === "cli") ? ("cli" as const) : ("app" as const);
      return { key, label, detail: t("signIns.onDevice"), profile: null, appKind, count: inside.length, toCheck: inside.filter((row) => needsCheck(row, staleBefore)).length };
    });
  return [...profiles, ...apps];
}

function Column({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <section aria-label={label} className={cn("min-h-0 min-w-0 flex-col", className)}>
      {children}
    </section>
  );
}

function ColumnHeader({ title, count, onBack, backLabel, actions }: { title: ReactNode; count?: number; onBack?: () => void; backLabel?: string; actions?: ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line px-2.5">
      {onBack ? (
        <IconButton label={backLabel ?? ""} onClick={onBack} className="lg:hidden">
          <ArrowLeft className="size-4" />
        </IconButton>
      ) : null}
      <h2 className="flex min-w-0 flex-1 items-center gap-1.5 px-1 text-[13px] font-bold text-ink">
        <span className="min-w-0 truncate">{title}</span>
        {count !== undefined ? <span className="shrink-0 font-mono text-xs font-medium text-faint">{count}</span> : null}
      </h2>
      {actions}
    </header>
  );
}

function CountPill({ count, toCheck }: { count: number; toCheck: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {toCheck > 0 ? <span className="size-1.5 rounded-full bg-warn" aria-hidden="true" /> : null}
      <span className="min-w-6 rounded-md bg-sunken px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold text-ink-2">{count}</span>
    </span>
  );
}

function rowClass(selected: boolean) {
  return cn(
    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
    selected ? "bg-accent-soft ring-1 ring-inset ring-accent-line" : "hover:bg-subtle",
  );
}

/** Which columns show at each width: phones show the deepest one, laptops three, wide screens all four. */
function columnVisibility(column: number, depth: number): string {
  const phone = column === depth;
  const laptop = depth === 4 ? column >= 2 : column <= 3;
  const wide = column <= Math.max(3, depth);
  return cn(phone ? "flex" : "hidden", laptop ? "lg:flex" : "lg:hidden", wide ? "xl:flex" : "xl:hidden");
}

export function SignInMap({ initial, startRecording, treeFocus = null }: { initial: MapSelection; startRecording: boolean; treeFocus?: TreeFocus | null }) {
  const { t, format } = useI18n();
  const { can } = useStaff();
  const notify = useToast();
  const router = useRouter();
  const canWrite = can("map.write");
  const map = useApi<MapData>("/api/map");
  const [selection, setSelection] = useState<MapSelection>(initial);
  const tree = useApi<TreeData>(selection.view === "tree" ? "/api/tree" : null);
  const reloadAll = () => {
    map.reload();
    if (selection.view === "tree") tree.reload();
  };
  const [drawer, setDrawer] = useState<DrawerState>(startRecording ? { kind: "signIn", deviceId: initial.deviceId, place: initial.place, account: null } : null);
  const { actions, dialogs } = useSignInActions(map.reload);

  const select = (next: Partial<MapSelection>) => {
    const merged = { ...selection, ...next };
    setSelection(merged);
    window.history.replaceState(null, "", urlFor(merged));
  };

  if (map.error && !map.data) {
    return <ErrorState title={t("common.loadFailed")} description={t("common.loadFailedHint")} retryLabel={t("common.retry")} onRetry={map.reload} />;
  }
  if (!map.data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={t("common.loading")}>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-[520px] w-full" />
      </div>
    );
  }

  const data = map.data;
  const staleBefore = data.staleBefore;
  const device = data.devices.find((candidate) => candidate.id === selection.deviceId) ?? null;
  const places = device ? placesOf(device, data, staleBefore, t) : [];
  const place = places.find((candidate) => candidate.key === selection.place) ?? null;
  const placeRows = device && place ? data.signIns.filter((row) => row.device.id === device.id && placeKeyOf(row) === place.key) : [];
  const accountRows = selection.accountId ? data.signIns.filter((row) => row.account.id === selection.accountId) : [];
  const account = accountRows[0] ?? null;
  const depth = account ? 4 : place ? 3 : device ? 2 : 1;
  const toCheck = data.signIns.filter((row) => needsCheck(row, staleBefore));
  const accountCount = new Set(data.signIns.map((row) => row.account.id)).size;
  const deviceToCheck = (id: number) => data.signIns.filter((row) => row.device.id === id && needsCheck(row, staleBefore)).length;

  const checkDevice = async (target: MapDevice) => {
    try {
      const result = await api(`/api/devices/${target.id}/check`, { method: "POST" });
      notify(result.message);
      map.reload();
    } catch (error) {
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
    }
  };

  const summary = [
    { label: t("map.statDevices"), value: data.devices.length },
    { label: t("map.statProfiles"), value: data.profiles.length },
    { label: t("map.statAccounts"), value: accountCount },
    { label: t("map.statSignIns"), value: data.signIns.length },
  ];

  const drawers = (
    <>
      {dialogs}
      {drawer?.kind === "device" ? (
        <DeviceDrawer
          device={drawer.device}
          onClose={() => setDrawer(null)}
          onSaved={(saved) => {
            setDrawer(null);
            map.reload();
            select({ deviceId: saved.id, place: null, accountId: null, view: "map" });
          }}
        />
      ) : null}
      {drawer?.kind === "profile" && device ? (
        <ProfileDrawer
          deviceId={device.id}
          deviceName={device.name}
          profile={null}
          onClose={() => setDrawer(null)}
          onSaved={(saved) => {
            setDrawer(null);
            map.reload();
            select({ place: `p:${saved.id}`, accountId: null });
          }}
        />
      ) : null}
      {drawer?.kind === "signIn" ? (
        <SignInDrawer
          deviceId={drawer.deviceId}
          place={drawer.place}
          account={drawer.account}
          onClose={() => setDrawer(null)}
          onSaved={(saved) => {
            setDrawer(null);
            reloadAll();
            // The trees redraw with the new leaf; the columns open where it was recorded.
            if (selection.view !== "tree") select({ deviceId: saved.device.id, place: placeKeyOf(saved), accountId: saved.account.id, view: "map" });
          }}
        />
      ) : null}
    </>
  );

  if (data.devices.length === 0) {
    return (
      <>
        <div className="bg-map-grid relative overflow-hidden rounded-panel border border-line bg-surface px-6 py-12 sm:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Waypoints className="size-6" />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">{t("map.emptyTitle")}</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted">{t("map.emptyBody")}</p>
            <ol className="mx-auto mt-8 grid max-w-xl gap-3 text-left sm:grid-cols-3">
              {[t("map.emptyStep1"), t("map.emptyStep2"), t("map.emptyStep3")].map((step, index) => (
                <li key={step} className="rounded-xl border border-line bg-surface p-3">
                  <span className="font-mono text-xs font-bold text-accent">0{index + 1}</span>
                  <p className="mt-1 text-[13px] font-semibold text-ink">{step}</p>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {canWrite ? (
                <Button icon={<Plus className="size-4" />} onClick={() => setDrawer({ kind: "device", device: null })}>
                  {t("devices.addTitle")}
                </Button>
              ) : null}
              <ButtonLink href="/app/assistant" variant="secondary" icon={<Sparkles className="size-4" />}>
                {t("map.emptyAssistant")}
              </ButtonLink>
            </div>
          </div>
        </div>
        {drawers}
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <dl className="grid flex-1 grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
          {summary.map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
              <dt className="sr-only">{item.label}</dt>
              <dd className="font-mono text-lg font-bold text-ink tabular-nums">
                <CountUp value={item.value} format={format.number} />
              </dd>
              <span aria-hidden="true" className="truncate text-[12px] text-muted sm:text-[13px]">
                {item.label}
              </span>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label={t("map.view")}
            value={selection.view}
            onChange={(view) => select({ view })}
            options={[
              { value: "tree", label: t("map.viewTree"), icon: <TreeDeciduous className="size-3.5" /> },
              { value: "map", label: t("map.viewMap"), icon: <Waypoints className="size-3.5" /> },
              {
                value: "check",
                label: toCheck.length > 0 ? t("map.viewCheckCount", { count: toCheck.length }) : t("map.viewCheck"),
                icon: <ListChecks className="size-3.5" />,
              },
            ]}
          />
          {canWrite ? (
            <Button
              className="ml-auto"
              icon={<Plus className="size-4" />}
              onClick={() => setDrawer({ kind: "signIn", deviceId: device?.id ?? null, place: place?.key ?? null, account: null })}
            >
              {t("signIns.recordButton")}
            </Button>
          ) : null}
        </div>
      </div>

      {selection.view === "tree" ? (
        tree.data ? (
          <TreeCanvas data={tree.data} reload={reloadAll} canWrite={canWrite} focus={treeFocus} onRecord={() => setDrawer({ kind: "signIn", deviceId: null, place: null, account: null })} />
        ) : tree.error ? (
          <ErrorState title={t("common.loadFailed")} description={t("common.loadFailedHint")} retryLabel={t("common.retry")} onRetry={tree.reload} />
        ) : (
          <Skeleton className="h-[calc(100dvh-15rem)] min-h-[440px] w-full sm:h-[calc(100dvh-11.5rem)]" />
        )
      ) : selection.view === "check" ? (
        <section className="rounded-panel border border-line bg-surface">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-ink">{t("map.checkTitle")}</h2>
              <p className="text-xs text-muted">{t("map.checkHint", { days: data.staleAfterDays })}</p>
            </div>
          </header>
          {toCheck.length === 0 ? (
            <EmptyState icon={<CheckCheck className="size-5" />} title={t("map.checkEmpty")} description={t("map.checkEmptyHint")} />
          ) : (
            <div className="divide-y divide-line">
              {data.devices
                .filter((candidate) => toCheck.some((row) => row.device.id === candidate.id))
                .map((candidate) => (
                  <div key={candidate.id} className="px-2 py-2">
                    <div className="flex items-center gap-2 px-2.5 py-1.5">
                      <DeviceIcon kind={candidate.kind} className="text-muted" />
                      <p className="flex-1 truncate text-[13px] font-bold text-ink">{candidate.name}</p>
                      {canWrite ? (
                        <Button variant="ghost" size="sm" icon={<CheckCheck className="size-4" />} onClick={() => void checkDevice(candidate)}>
                          {t("devices.checkAll")}
                        </Button>
                      ) : null}
                    </div>
                    {toCheck
                      .filter((row) => row.device.id === candidate.id)
                      .map((row) => (
                        <SignInLine key={row.id} row={row} show="both" staleBefore={staleBefore} actions={actions} canWrite={canWrite} />
                      ))}
                  </div>
                ))}
            </div>
          )}
        </section>
      ) : (
        <div className="flex h-[calc(100dvh-210px)] min-h-[520px] overflow-hidden rounded-panel border border-line bg-surface md:h-[calc(100dvh-180px)]">
          {/* 1 · devices */}
          <Column label={t("map.columnDevices")} className={cn("w-full border-line lg:w-64 lg:shrink-0 lg:border-r", columnVisibility(1, depth))}>
            <ColumnHeader
              title={t("map.columnDevices")}
              count={data.devices.length}
              actions={
                canWrite ? (
                  <IconButton label={t("devices.addTitle")} onClick={() => setDrawer({ kind: "device", device: null })}>
                    <Plus className="size-4" />
                  </IconButton>
                ) : null
              }
            />
            <div className="scroll-thin flex-1 space-y-0.5 overflow-y-auto p-1.5">
              {data.devices.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => select({ deviceId: candidate.id, place: null, accountId: null })}
                  className={rowClass(candidate.id === device?.id)}
                  aria-pressed={candidate.id === device?.id}
                >
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2">
                    <DeviceIcon kind={candidate.kind} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{candidate.name}</span>
                    <span className="block truncate text-xs text-muted">{[systemLabel(candidate.system, t), candidate.location].filter(Boolean).join(" · ")}</span>
                  </span>
                  <CountPill count={candidate.accountCount} toCheck={deviceToCheck(candidate.id)} />
                  <ChevronRight className="size-4 shrink-0 text-faint" />
                </button>
              ))}
            </div>
          </Column>

          {/* 2 · places on the device */}
          <Column label={t("map.columnPlaces")} className={cn("w-full border-line lg:w-64 lg:shrink-0 lg:border-r", columnVisibility(2, depth))}>
            {device ? (
              <>
                <ColumnHeader
                  title={device.name}
                  onBack={() => select({ deviceId: null, place: null, accountId: null })}
                  backLabel={t("common.back")}
                  actions={
                    <>
                      {canWrite ? (
                        <IconButton label={t("profiles.addTitle")} onClick={() => setDrawer({ kind: "profile" })}>
                          <Plus className="size-4" />
                        </IconButton>
                      ) : null}
                      <Menu
                        label={t("common.more")}
                        items={[
                          { label: t("devices.openDetail"), icon: ArrowUpRight, onSelect: () => router.push(`/app/devices/${device.id}`) },
                          {
                            label: t("common.edit"),
                            icon: Pencil,
                            hidden: !canWrite,
                            onSelect: () => setDrawer({ kind: "device", device: { id: device.id, name: device.name, kind: device.kind, system: device.system, location: device.location, notes: device.notes, hostname: device.hostname } }),
                          },
                          { label: t("devices.checkAll"), icon: CheckCheck, hidden: !canWrite, onSelect: () => void checkDevice(device) },
                        ]}
                      />
                    </>
                  }
                />
                <div className="scroll-thin flex-1 overflow-y-auto p-1.5">
                  <p className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-faint">{t("map.groupProfiles")}</p>
                  {places.filter((candidate) => candidate.profile).length === 0 ? (
                    <p className="px-2.5 py-2 text-xs text-muted">{t("map.noProfiles")}</p>
                  ) : null}
                  {places
                    .filter((candidate) => candidate.profile)
                    .map((candidate) => (
                      <button key={candidate.key} type="button" onClick={() => select({ place: candidate.key, accountId: null })} className={rowClass(candidate.key === place?.key)} aria-pressed={candidate.key === place?.key}>
                        {candidate.profile ? <BrowserMark browser={candidate.profile.browser} color={candidate.profile.color} /> : null}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">{candidate.label}</span>
                          <span className="block truncate text-xs text-muted">{candidate.detail}</span>
                        </span>
                        <CountPill count={candidate.count} toCheck={candidate.toCheck} />
                      </button>
                    ))}
                  <p className="px-2.5 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-faint">{t("map.groupOnDevice")}</p>
                  {places.filter((candidate) => !candidate.profile).length === 0 ? <p className="px-2.5 py-2 text-xs text-muted">{t("map.noApps")}</p> : null}
                  {places
                    .filter((candidate) => !candidate.profile)
                    .map((candidate) => (
                      <button key={candidate.key} type="button" onClick={() => select({ place: candidate.key, accountId: null })} className={rowClass(candidate.key === place?.key)} aria-pressed={candidate.key === place?.key}>
                        <AppMark kind={candidate.appKind} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{candidate.label}</span>
                        <CountPill count={candidate.count} toCheck={candidate.toCheck} />
                      </button>
                    ))}
                </div>
                <footer className="border-t border-line px-3 py-2.5 text-xs text-muted">
                  {device.lastCheckedAt ? t("devices.lastChecked", { when: format.relativeDays(device.lastCheckedAt) }) : t("devices.neverChecked")}
                </footer>
              </>
            ) : (
              <EmptyState icon={<Laptop className="size-5" />} title={t("map.pickDevice")} description={t("map.pickDeviceHint")} className="flex-1" />
            )}
          </Column>

          {/* 3 · accounts at the place */}
          <Column label={t("map.columnAccounts")} className={cn("w-full flex-1 border-line xl:border-r", columnVisibility(3, depth))}>
            {device && place ? (
              <>
                <ColumnHeader
                  title={
                    <span className="flex items-center gap-2">
                      {place.profile ? <BrowserMark browser={place.profile.browser} color={place.profile.color} className="size-5 rounded-md text-[9px]" /> : null}
                      <span className="truncate">{place.profile ? `${place.detail} · ${place.label}` : place.label}</span>
                    </span>
                  }
                  count={placeRows.length}
                  onBack={() => select({ place: null, accountId: null })}
                  backLabel={t("common.back")}
                  actions={
                    canWrite ? (
                      <Button size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={() => setDrawer({ kind: "signIn", deviceId: device.id, place: place.key, account: null })}>
                        {t("signIns.recordShort")}
                      </Button>
                    ) : null
                  }
                />
                <div className="scroll-thin flex-1 space-y-0.5 overflow-y-auto p-1.5">
                  {placeRows.length === 0 ? (
                    <EmptyState icon={<Waypoints className="size-5" />} title={t("map.placeEmpty")} description={t("map.placeEmptyHint")} />
                  ) : (
                    placeRows.map((row) => (
                      <SignInLine
                        key={row.id}
                        row={row}
                        show="account"
                        staleBefore={staleBefore}
                        actions={actions}
                        canWrite={canWrite}
                        selected={row.account.id === selection.accountId}
                        onSelect={() => select({ accountId: row.account.id })}
                      />
                    ))
                  )}
                </div>
              </>
            ) : device ? (
              <EmptyState icon={<Waypoints className="size-5" />} title={t("map.pickPlace")} description={t("map.pickPlaceHint")} className="flex-1" />
            ) : (
              <EmptyState icon={<Waypoints className="size-5" />} title={t("map.howTitle")} description={t("map.howBody")} className="flex-1" />
            )}
          </Column>

          {/* 4 · everywhere the selected account is signed in */}
          {account ? (
            <Column label={t("map.columnEverywhere")} className={cn("w-full animate-column-in lg:w-80 lg:shrink-0", columnVisibility(4, depth))}>
              <ColumnHeader
                title={t("map.columnEverywhere")}
                onBack={() => select({ accountId: null })}
                backLabel={t("common.back")}
                actions={
                  <IconButton label={t("common.close")} onClick={() => select({ accountId: null })} className="hidden lg:inline-flex">
                    <X className="size-4" />
                  </IconButton>
                }
              />
              <div className="scroll-thin flex-1 overflow-y-auto p-3">
                <div className="flex items-center gap-3">
                  <ProviderAvatar provider={account.provider} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[13px] font-bold text-ink">{account.account.identifier}</p>
                    <p className="truncate text-xs text-muted">{[account.provider.name, account.account.label].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
                <p className="mt-4 text-[13px] font-semibold text-ink">{t("map.signedInPlaces", { count: accountRows.length })}</p>
                {accountRows.length > 1 ? (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-warn-ink">
                    <AlertTriangle className="size-3.5" />
                    {t("map.manyPlacesHint")}
                  </p>
                ) : null}
                <div className="mt-2 space-y-0.5">
                  {accountRows.map((row) => (
                    <SignInLine
                      key={row.id}
                      row={row}
                      show="place"
                      compact
                      staleBefore={staleBefore}
                      actions={actions}
                      canWrite={canWrite}
                      selected={row.device.id === device?.id && placeKeyOf(row) === place?.key}
                      onSelect={() => select({ deviceId: row.device.id, place: placeKeyOf(row) })}
                    />
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ButtonLink href={`/app/accounts/${account.account.id}`} variant="secondary" size="sm" icon={<ArrowUpRight className="size-4" />}>
                    {t("accounts.openDetail")}
                  </ButtonLink>
                  {canWrite ? (
                    <Button
                      size="sm"
                      variant="soft"
                      icon={<Plus className="size-4" />}
                      onClick={() =>
                        setDrawer({
                          kind: "signIn",
                          deviceId: null,
                          place: null,
                          account: { id: account.account.id, identifier: account.account.identifier, label: account.account.label, provider: account.provider },
                        })
                      }
                    >
                      {t("signIns.recordElsewhere")}
                    </Button>
                  ) : null}
                </div>
              </div>
            </Column>
          ) : null}
        </div>
      )}
      <p className="mt-3 hidden text-xs text-faint md:block">
        {t("map.tip")}{" "}
        <Link href="/app/assistant" className="font-semibold text-accent hover:underline">
          {t("map.tipLink")}
        </Link>
      </p>
      {drawers}
    </>
  );
}
