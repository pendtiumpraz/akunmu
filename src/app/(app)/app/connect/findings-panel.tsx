"use client";

import { CheckCheck, Inbox, Laptop, Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { newProviderColor, providerNameFromDomain } from "@/modules/accounts/colors";
import { api } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Badge } from "@/shared/ui/badge";
import { Button, IconButton } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/shared/ui/feedback";
import { Input } from "@/shared/ui/form-controls";
import { useToast } from "@/shared/ui/toast";
import { useApi } from "@/shared/ui/use-api";
import { useStaff } from "../app-shell";
import type { FindingItem, ProviderItem } from "../map-types";
import { ProfileMark, ProviderAvatar, profileClientLabel, systemLabel } from "../ui";

type FindingList = ReturnType<typeof useApi<FindingItem[]>>;
type Group = { key: string; findings: FindingItem[]; head: FindingItem };

const KIND_ORDER: Record<FindingItem["kind"], number> = { device: 0, profile: 1, sign_in: 2 };

/** The workspace's provider for a domain (the domain itself or a subdomain of it), if any. */
function providerFor(providers: ProviderItem[], domain: string | undefined): ProviderItem | undefined {
  if (!domain) return undefined;
  return providers.find((provider) => provider.domain && (domain === provider.domain || domain.endsWith(`.${provider.domain}`)));
}

/** Findings grouped by where they were seen: a computer, or one browser profile on a device. */
function groupFindings(findings: FindingItem[]): Group[] {
  const groups = new Map<string, Group>();
  const sorted = [...findings].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.createdAt.localeCompare(b.createdAt));
  for (const finding of sorted) {
    const { payload } = finding;
    const place = finding.deviceId ? `d${finding.deviceId}` : `h${payload.hostname ?? ""}`;
    const key = finding.kind === "device" ? `device:${place}` : `${place}:${payload.browser ?? ""}:${payload.profile?.name.toLowerCase() ?? ""}`;
    const group = groups.get(key);
    if (group) group.findings.push(finding);
    else groups.set(key, { key, findings: [finding], head: finding });
  }
  return [...groups.values()];
}

/** What the browser extension and AkunMu Desktop found that is not in the trees yet, to accept or dismiss. */
export function FindingsPanel({ findings }: { findings: FindingList }) {
  const { t, format } = useI18n();
  const { can } = useStaff();
  const notify = useToast();
  const canWrite = can("map.write");
  const providers = useApi<ProviderItem[]>("/api/providers");
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const list = findings.data ?? [];

  const act = async (target: number | "all", path: string, body?: unknown) => {
    setBusy(target);
    try {
      const result = await api(path, { method: "POST", body });
      notify(result.message);
      if (target !== "all") findings.setData((current) => current?.filter((finding) => finding.id !== target) ?? null);
      findings.reload();
      providers.reload();
      return true;
    } catch (error) {
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {t("connect.findingsTitle")}
            {list.length > 0 ? <Badge tone="accent">{format.number(list.length)}</Badge> : null}
          </span>
        }
        description={t("connect.findingsHint")}
        action={
          canWrite && list.length > 1 ? (
            <Button size="sm" variant="secondary" icon={<CheckCheck className="size-4" />} loading={busy === "all"} onClick={() => void act("all", "/api/connect/findings/accept-all")}>
              {t("connect.acceptAll")}
            </Button>
          ) : null
        }
      />
      {findings.error && !findings.data ? (
        <ErrorState title={t("common.loadFailed")} description={t("common.loadFailedHint")} retryLabel={t("common.retry")} onRetry={findings.reload} />
      ) : !findings.data ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={<Inbox className="size-5" />} title={t("connect.noFindings")} description={t("connect.noFindingsHint")} />
      ) : (
        <ul className="divide-y divide-line">
          {groupFindings(list).map((group) => (
            <li key={group.key} className="px-4 py-3">
              <GroupHead finding={group.head} />
              <ul className="mt-1.5 space-y-1">
                {group.findings.map((finding) => (
                  <FindingRow
                    key={finding.id}
                    finding={finding}
                    providers={providers.data ?? []}
                    canWrite={canWrite}
                    busy={busy === finding.id || busy === "all"}
                    onAccept={(identifier) => act(finding.id, `/api/connect/findings/${finding.id}/accept`, { identifier })}
                    onDismiss={() => void act(finding.id, `/api/connect/findings/${finding.id}/dismiss`)}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Where a group was seen: "PC #1 · Chrome · Work", or the new computer's name. */
function GroupHead({ finding }: { finding: FindingItem }) {
  const { t } = useI18n();
  const { payload } = finding;
  const place = finding.deviceName ?? payload.hostname ?? "";
  if (finding.kind === "device") {
    return (
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">
        <Laptop className="size-3.5" />
        {t("connect.groupComputer")}
      </p>
    );
  }
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">
      <span className="truncate">{[place, payload.browser ? profileClientLabel(payload.browser, t) : null, payload.profile?.name].filter(Boolean).join(" · ")}</span>
    </p>
  );
}

function FindingRow({
  finding,
  providers,
  canWrite,
  busy,
  onAccept,
  onDismiss,
}: {
  finding: FindingItem;
  providers: ProviderItem[];
  canWrite: boolean;
  busy: boolean;
  onAccept: (identifier?: string) => Promise<boolean>;
  onDismiss: () => void;
}) {
  const { t, format } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const { payload } = finding;
  const needsIdentifier = finding.kind === "sign_in" && !payload.identifier;

  let mark: ReactNode;
  let title: ReactNode;
  let detail: string;
  if (finding.kind === "device") {
    mark = (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2">
        <Laptop className="size-4" />
      </span>
    );
    title = <span className="font-mono">{payload.hostname}</span>;
    detail = [t("connect.kindDevice"), payload.system ? systemLabel(payload.system, t) : null].filter(Boolean).join(" · ");
  } else if (finding.kind === "profile") {
    mark = <ProfileMark client={payload.browser ?? "chrome"} />;
    title = payload.profile?.name;
    detail = [t("connect.kindProfile", { browser: payload.browser ? profileClientLabel(payload.browser, t) : "" }), payload.profile?.email].filter(Boolean).join(" · ");
  } else {
    const domain = payload.provider?.domain ?? "";
    const provider = providerFor(providers, domain);
    const name = provider?.name ?? payload.provider?.name ?? providerNameFromDomain(domain);
    mark = <ProviderAvatar provider={provider ?? { name, color: newProviderColor(name) }} />;
    title = payload.identifier ? <span className="font-mono">{payload.identifier}</span> : <span className="font-normal italic text-muted">{t("connect.unknownAccount")}</span>;
    detail = provider ? name : `${name} · ${t("connect.newProvider", { domain })}`;
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-1.5 py-1.5 hover:bg-subtle">
      {mark}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">{title}</span>
        <span className="block truncate text-xs text-muted">
          {detail}
          <span className="text-faint"> · {t("connect.seenAgo", { when: format.relativeDays(finding.lastSeenAt) })}</span>
        </span>
      </span>
      {canWrite ? (
        <form
          className="flex shrink-0 items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            void onAccept(needsIdentifier ? identifier : undefined);
          }}
        >
          {needsIdentifier ? (
            <Input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder={t("connect.identifierPlaceholder")}
              aria-label={t("connect.identifierPlaceholder")}
              maxLength={200}
              autoComplete="off"
              className="h-8 w-48 font-mono text-[13px]"
            />
          ) : null}
          <Button type="submit" size="sm" variant="soft" icon={<Plus className="size-4" />} loading={busy} disabled={needsIdentifier && identifier.trim() === ""}>
            {t("connect.accept")}
          </Button>
          <IconButton label={t("connect.dismiss")} onClick={onDismiss} disabled={busy}>
            <X className="size-4" />
          </IconButton>
        </form>
      ) : null}
    </li>
  );
}
