"use client";

import { ExternalLink, Link2, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { ErrorState, Skeleton } from "@/shared/ui/feedback";
import { Select } from "@/shared/ui/form-controls";
import { useToast } from "@/shared/ui/toast";
import { useApi } from "@/shared/ui/use-api";
import { useStaff } from "../app-shell";
import type { DeviceListItem, ThisComputer } from "../map-types";
import { BrowserMark, ProfileMark, systemLabel } from "../ui";

/**
 * The computer AkunMu Desktop runs on: which recorded device it is, a scan of its browser profiles and Claude Code
 * profiles (new ones become findings), and each browser profile opened in its browser with one click.
 */
export function ThisComputerPanel({ onScanned }: { onScanned: () => void }) {
  const { t } = useI18n();
  const { can } = useStaff();
  const notify = useToast();
  const canWrite = can("map.write");
  const computer = useApi<ThisComputer>("/api/desktop/computer");
  const devices = useApi<DeviceListItem[]>(canWrite ? "/api/devices" : null);
  const [choice, setChoice] = useState<number | null>(null);
  // "scan", "link", or the profile being opened ("<browser>:<folder>").
  const [busy, setBusy] = useState<string | null>(null);

  const fail = (error: unknown) => notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");

  const scan = async () => {
    setBusy("scan");
    try {
      const result = await api("/api/desktop/scan", { method: "POST" });
      notify(result.message);
      computer.reload();
      onScanned();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const link = async (deviceId: number) => {
    setBusy("link");
    try {
      const result = await api<ThisComputer>("/api/desktop/computer", { method: "POST", body: { deviceId } });
      computer.setData(result.data);
      setChoice(null);
      notify(result.message);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const open = async (profile: ThisComputer["profiles"][number]) => {
    const key = `${profile.browser}:${profile.directory}`;
    setBusy(key);
    try {
      const result = await api("/api/desktop/open", { method: "POST", body: { browser: profile.browser, directory: profile.directory } });
      notify(result.message);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const data = computer.data;
  const linked = data?.device ?? null;
  const selected = choice ?? linked?.id ?? devices.data?.[0]?.id ?? null;

  return (
    <Card>
      <CardHeader
        title={t("connect.computerTitle")}
        description={data ? <span className="font-mono">{`${data.hostname} · ${systemLabel(data.system, t)}`}</span> : undefined}
        action={
          canWrite ? (
            <Button size="sm" icon={<ScanSearch className="size-4" />} loading={busy === "scan"} onClick={() => void scan()}>
              {t("connect.scan")}
            </Button>
          ) : null
        }
      />
      {computer.error && !data ? (
        <ErrorState title={t("common.loadFailed")} description={t("common.loadFailedHint")} retryLabel={t("common.retry")} onRetry={computer.reload} />
      ) : !data ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-9" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-semibold text-ink-2">{t("connect.computerDevice")}</span>
            {linked ? (
              <Link href={`/app/devices/${linked.id}`} className="font-semibold text-accent hover:underline">
                {linked.name}
              </Link>
            ) : (
              <span className="text-muted">{t("connect.computerNotLinked")}</span>
            )}
            {canWrite && devices.data && devices.data.length > 0 ? (
              <span className="ml-auto flex items-center gap-1.5">
                <Select fullWidth={false} value={selected ?? ""} onChange={(event) => setChoice(Number(event.target.value))} aria-label={t("connect.chooseDevice")}>
                  {devices.data.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Link2 className="size-4" />}
                  loading={busy === "link"}
                  disabled={selected === null || selected === linked?.id}
                  onClick={() => selected !== null && void link(selected)}
                >
                  {t("connect.link")}
                </Button>
              </span>
            ) : null}
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">{t("connect.localProfiles")}</p>
            {data.profiles.length === 0 ? (
              <p className="text-[13px] text-muted">{t("connect.noLocalProfiles")}</p>
            ) : (
              <ul className="space-y-1">
                {data.profiles.map((profile) => {
                  const key = `${profile.browser}:${profile.directory}`;
                  return (
                    <li key={key} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-subtle">
                      <BrowserMark browser={profile.browser} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-semibold text-ink">{profile.name}</span>
                          {profile.recorded ? <Badge tone="ok">{t("connect.recorded")}</Badge> : null}
                        </span>
                        <span className="block truncate font-mono text-xs text-muted">{profile.email ?? profile.directory}</span>
                      </span>
                      <Button size="sm" variant="ghost" icon={<ExternalLink className="size-4" />} loading={busy === key} onClick={() => void open(profile)}>
                        {t("connect.open")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {data.cliProfiles.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">{t("connect.localCliProfiles")}</p>
              <ul className="space-y-1">
                {data.cliProfiles.map((profile) => (
                  <li key={profile.directory} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-subtle">
                    <ProfileMark client={profile.client} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-mono text-[13px] font-semibold text-ink">{profile.name}</span>
                        {profile.recorded ? <Badge tone="ok">{t("connect.recorded")}</Badge> : null}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted">{profile.email ?? t("connect.cliSignedOut")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
