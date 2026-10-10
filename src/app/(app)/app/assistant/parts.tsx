"use client";

import { ChevronDown, CircleAlert, CircleCheck, ExternalLink, Flag, KeyRound, LockKeyhole, ShieldQuestion, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { AgentActionView, AgentMessageView, StoredToolResult } from "@/modules/ai/agent-types";
import { BROWSER_NAMES, type Browser, type DeviceKind } from "@/modules/devices/types";
import { useI18n } from "@/shared/i18n/client";
import type { Translator } from "@/shared/i18n/translate";
import { Badge, type BadgeTone } from "@/shared/ui/badge";
import { Button, Spinner } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Field, Input } from "@/shared/ui/form-controls";
import { DeviceIcon } from "../ui";
import { Markdown, MentionChip, MENTION_SPLIT, parseMention } from "./markdown";

/*
 * Result data of the assistant's tools, as the server's tools return it (see src/server/agent/tools.ts).
 * Every field is optional here: old chats keep the shape they were stored with.
 */
type Place = { browserProfileId?: number; browser?: string; profile?: string; app?: string } | string;
type SignInData = {
  signInId: number;
  account?: { id: number; identifier: string; label: string | null; provider: string };
  device?: { id: number; name: string };
  place?: Place;
  status?: string;
  lastConfirmed?: string;
  toCheck?: boolean;
  signedOutOn?: string | null;
};
type AccountData = { id: number; identifier: string; label?: string | null; provider?: string; signedIn?: SignInData[]; recentlySignedOut?: SignInData[]; url?: string };
type DeviceData = { id: number; name: string; kind?: string; system?: string; location?: string | null; browserProfiles?: number; signIns?: number; accounts?: number; markedForReview?: number; lastChecked?: string | null };
type DeviceDetailData = Omit<DeviceData, "browserProfiles"> & {
  browserProfiles?: { id: number; browser: string; name: string; signIns: SignInData[] }[];
  onTheDevice?: SignInData[];
  url?: string;
};
type Data = Record<string, unknown>;

function asData(result: StoredToolResult | null | undefined): Data {
  return result?.ok && result.data && typeof result.data === "object" ? (result.data as Data) : {};
}

function placeText(place: Place | undefined, t: Translator): string {
  if (!place || typeof place === "string") return t("signIns.deviceItself");
  if (place.profile) return `${BROWSER_NAMES[place.browser as Exclude<Browser, "other">] ?? t("devices.browserOther")} · ${place.profile}`;
  return place.app ?? t("signIns.deviceItself");
}

// ----- the assistant's avatar and thinking row -----

export function AssistantAvatar({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary", className)} aria-hidden="true">
      <Sparkles className="size-4" strokeWidth={2.4} />
    </span>
  );
}

export function ThinkingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" role="status" aria-live="polite">
      <AssistantAvatar />
      <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm text-muted">
        <span className="flex gap-1" aria-hidden="true">
          {[0, 1, 2].map((dot) => (
            <span key={dot} className="size-1.5 rounded-full bg-faint motion-safe:animate-bounce" style={{ animationDelay: `${dot * 140}ms` }} />
          ))}
        </span>
        {label}
      </div>
    </div>
  );
}

// ----- user bubble -----

export function UserBubble({ message }: { message: AgentMessageView }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[min(85%,640px)] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[14.5px] leading-relaxed text-on-primary">
        {message.content.split(MENTION_SPLIT).map((part, index) => {
          const mention = parseMention(part);
          return mention ? <MentionChip key={index} title={mention.title} inverted /> : <span key={index}>{part}</span>;
        })}
      </div>
    </div>
  );
}

// ----- tool steps -----

function stepSummary(name: string, result: StoredToolResult, t: Translator, format: ReturnType<typeof useI18n>["format"]): string | null {
  if (!result.ok) return result.error ?? null;
  const data = asData(result);
  const count = (key: string) => format.number(((data[key] as unknown[]) ?? []).length);
  switch (name) {
    case "find_account":
      return t("ai.result.accountsFound", { count: count("accounts") });
    case "list_devices":
      return t("ai.result.devices", { count: count("devices") });
    case "get_device":
      return String(data.name ?? "");
    case "list_accounts":
      return t("ai.result.accounts", { count: format.number(Number(data.total ?? 0)) });
    case "list_providers":
      return t("ai.result.providers", { count: count("providers") });
    case "get_overview": {
      const totals = data.totals as { signIns?: number; stale?: number; review?: number } | undefined;
      return t("ai.result.overview", { signIns: format.number(totals?.signIns ?? 0), toCheck: format.number((totals?.stale ?? 0) + (totals?.review ?? 0)) });
    }
    default:
      return null;
  }
}

const WITH_CARD = new Set(["find_account", "list_devices", "get_device", "list_accounts", "get_overview"]);
const OPEN_BY_DEFAULT = new Set(["find_account"]);

export function ToolSteps({ message }: { message: AgentMessageView }) {
  const { t, format } = useI18n();
  const actionCalls = new Set(message.actions.map((action) => action.callId));
  const calls = message.toolCalls.filter((call) => !actionCalls.has(call.id));
  if (calls.length === 0) return null;
  return (
    <div className="space-y-2">
      {calls.map((call) => {
        const result = message.results.find((item) => item.callId === call.id) ?? null;
        return <ToolStep key={call.id} name={call.name} result={result} summary={result ? stepSummary(call.name, result, t, format) : null} />;
      })}
    </div>
  );
}

function ToolStep({ name, result, summary }: { name: string; result: StoredToolResult | null; summary: string | null }) {
  const { t } = useI18n();
  const hasCard = Boolean(result?.ok && WITH_CARD.has(name));
  const [open, setOpen] = useState(OPEN_BY_DEFAULT.has(name));
  const icon = !result ? <Spinner className="size-3.5 text-accent" /> : result.ok ? <CircleCheck className="size-3.5 text-ok" /> : <CircleAlert className="size-3.5 text-danger" />;
  return (
    <div>
      <button
        type="button"
        onClick={() => hasCard && setOpen((value) => !value)}
        aria-expanded={hasCard ? open : undefined}
        className={cn(
          "inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface py-1 pl-2 pr-3 text-xs text-ink-2",
          hasCard ? "hover:border-line-strong hover:text-ink" : "cursor-default",
        )}
      >
        {icon}
        <Wrench className="size-3 text-faint" aria-hidden="true" />
        <span className="font-semibold text-ink">{t.dynamic(`ai.tools.${name}`)}</span>
        {summary ? <span className={cn("truncate", result?.ok ? "text-muted" : "text-danger-ink")}>· {summary}</span> : null}
        {hasCard ? <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} /> : null}
      </button>
      {hasCard && open && result ? <div className="mt-2 animate-pop">{resultCard(name, result)}</div> : null}
    </div>
  );
}

function resultCard(name: string, result: StoredToolResult): ReactNode {
  const data = asData(result);
  switch (name) {
    case "find_account":
      return <WhereCard accounts={(data.accounts as AccountData[]) ?? []} />;
    case "list_devices":
      return <DevicesCard devices={(data.devices as DeviceData[]) ?? []} />;
    case "get_device":
      return <DeviceCard device={data as unknown as DeviceDetailData} />;
    case "list_accounts":
      return <AccountsCard data={data} />;
    case "get_overview":
      return <OverviewCard data={data} />;
    default:
      return null;
  }
}

function CardShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {children}
      {footer ? <div className="flex flex-wrap items-center gap-2 border-t border-line bg-subtle px-4 py-2.5">{footer}</div> : null}
    </div>
  );
}

function PageLink({ href, label }: { href: string | undefined; label: string }) {
  if (!href) return null;
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline">
      {label}
      <ExternalLink className="size-3.5" />
    </Link>
  );
}

function SignInItem({ signIn, show }: { signIn: SignInData; show: "place" | "account" }) {
  const { t } = useI18n();
  return (
    <li className="flex items-center gap-3 px-4 py-2 text-sm">
      <span className="min-w-0 flex-1">
        {show === "place" ? (
          <>
            <span className="block truncate font-semibold text-ink">{placeText(signIn.place, t)}</span>
            <span className="block truncate text-xs text-muted">{signIn.device?.name}</span>
          </>
        ) : (
          <>
            <span className="block truncate font-mono text-[13px] font-semibold text-ink">{signIn.account?.identifier}</span>
            <span className="block truncate text-xs text-muted">{[signIn.account?.provider, signIn.account?.label].filter(Boolean).join(" · ")}</span>
          </>
        )}
      </span>
      {signIn.status === "signed_out" ? (
        <span className="shrink-0 text-xs text-faint">{t("ai.result.signedOutOn", { date: signIn.signedOutOn ?? "" })}</span>
      ) : signIn.toCheck ? (
        <Badge tone="warn">
          <Flag className="size-3" />
          {t("ai.result.toCheck")}
        </Badge>
      ) : (
        <span className="shrink-0 font-mono text-[11px] text-faint">{signIn.lastConfirmed}</span>
      )}
    </li>
  );
}

function WhereCard({ accounts }: { accounts: AccountData[] }) {
  const { t, format } = useI18n();
  if (accounts.length === 0) return <CardShell><p className="px-4 py-3 text-sm text-muted">{t("ai.result.noAccounts")}</p></CardShell>;
  return (
    <div className="space-y-2">
      {accounts.map((account) => (
        <CardShell key={account.id} footer={<PageLink href={account.url} label={t("ai.result.openAccount")} />}>
          <div className="border-b border-line px-4 py-2.5">
            <p className="truncate font-mono text-[13px] font-bold text-ink">{account.identifier}</p>
            <p className="text-xs text-muted">
              {[account.provider, account.label].filter(Boolean).join(" · ")} · {t("ai.result.places", { count: format.number(account.signedIn?.length ?? 0) })}
            </p>
          </div>
          {(account.signedIn?.length ?? 0) === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">{t("accounts.nowhere")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {account.signedIn?.map((signIn) => <SignInItem key={signIn.signInId} signIn={signIn} show="place" />)}
            </ul>
          )}
          {(account.recentlySignedOut?.length ?? 0) > 0 ? (
            <ul className="divide-y divide-line border-t border-line opacity-80">
              {account.recentlySignedOut?.map((signIn) => <SignInItem key={signIn.signInId} signIn={signIn} show="place" />)}
            </ul>
          ) : null}
        </CardShell>
      ))}
    </div>
  );
}

function DevicesCard({ devices }: { devices: DeviceData[] }) {
  const { t, format } = useI18n();
  if (devices.length === 0) return <CardShell><p className="px-4 py-3 text-sm text-muted">{t("devices.empty")}</p></CardShell>;
  return (
    <CardShell footer={<PageLink href="/app/devices" label={t("ai.result.openDevices")} />}>
      <ul className="divide-y divide-line">
        {devices.map((device) => (
          <li key={device.id}>
            <Link href={`/app/devices/${device.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-subtle">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2">
                <DeviceIcon kind={(device.kind ?? "other") as DeviceKind} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{device.name}</span>
                <span className="block truncate text-xs text-muted">{[device.system, device.location].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="shrink-0 text-right text-xs text-muted">
                <span className="block font-mono text-sm font-bold text-ink">{format.number(device.accounts ?? 0)}</span>
                {t("ai.result.accountsShort")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function DeviceCard({ device }: { device: DeviceDetailData }) {
  const { t } = useI18n();
  const profiles = device.browserProfiles ?? [];
  const onDevice = device.onTheDevice ?? [];
  return (
    <CardShell footer={<PageLink href={device.url} label={t("ai.result.openDevice")} />}>
      <div className="border-b border-line px-4 py-2.5">
        <p className="font-semibold text-ink">{device.name}</p>
        <p className="text-xs text-muted">{[device.system, device.location].filter(Boolean).join(" · ")}</p>
      </div>
      {profiles.map((profile) => (
        <div key={profile.id} className="border-b border-line last:border-b-0">
          <p className="px-4 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-faint">
            {BROWSER_NAMES[profile.browser as Exclude<Browser, "other">] ?? t("devices.browserOther")} · {profile.name}
          </p>
          {profile.signIns.length === 0 ? (
            <p className="px-4 pb-2.5 text-xs text-muted">{t("map.placeEmpty")}</p>
          ) : (
            <ul>{profile.signIns.map((signIn) => <SignInItem key={signIn.signInId} signIn={signIn} show="account" />)}</ul>
          )}
        </div>
      ))}
      {onDevice.length > 0 ? (
        <div>
          <p className="px-4 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-faint">{t("map.groupOnDevice")}</p>
          <ul>{onDevice.map((signIn) => <SignInItem key={signIn.signInId} signIn={signIn} show="account" />)}</ul>
        </div>
      ) : null}
    </CardShell>
  );
}

function AccountsCard({ data }: { data: Data }) {
  const { t, format } = useI18n();
  const accounts = (data.accounts as { id: number; identifier: string; label: string | null; provider: string; signedInPlaces: number }[]) ?? [];
  return (
    <CardShell footer={<PageLink href="/app/accounts" label={t("ai.result.openAccounts")} />}>
      {accounts.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">{t("ai.result.noAccounts")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {accounts.map((account) => (
            <li key={account.id}>
              <Link href={`/app/accounts/${account.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-subtle">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[13px] font-semibold text-ink">{account.identifier}</span>
                  <span className="block truncate text-xs text-muted">{[account.provider, account.label].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="shrink-0 font-mono text-sm font-bold text-ink">{format.number(account.signedInPlaces)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {Number(data.total ?? 0) > accounts.length ? (
        <p className="border-t border-line px-4 py-2 text-xs text-muted">{t("ai.result.showing", { shown: format.number(accounts.length), total: format.number(Number(data.total)) })}</p>
      ) : null}
    </CardShell>
  );
}

function OverviewCard({ data }: { data: Data }) {
  const { t, format } = useI18n();
  const totals = (data.totals as Record<string, number>) ?? {};
  const toCheck = (data.toCheck as SignInData[]) ?? [];
  const stats = [
    { label: t("map.statDevices"), value: totals.devices ?? 0 },
    { label: t("map.statAccounts"), value: totals.accounts ?? 0 },
    { label: t("map.statSignIns"), value: totals.signIns ?? 0 },
    { label: t("ai.result.toCheck"), value: (totals.stale ?? 0) + (totals.review ?? 0) },
  ];
  return (
    <CardShell footer={<PageLink href="/app?view=check" label={t("ai.result.openCheck")} />}>
      <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-surface px-4 py-2.5">
            <dt className="text-[11px] font-semibold text-muted">{stat.label}</dt>
            <dd className="font-mono text-lg font-bold text-ink">{format.number(stat.value)}</dd>
          </div>
        ))}
      </dl>
      {toCheck.length > 0 ? (
        <ul className="divide-y divide-line border-t border-line">
          {toCheck.map((signIn) => (
            <li key={signIn.signInId} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[13px] font-semibold text-ink">{signIn.account?.identifier}</span>
                <span className="block truncate text-xs text-muted">
                  {placeText(signIn.place, t)} — {signIn.device?.name}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] text-warn-ink">{signIn.lastConfirmed}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </CardShell>
  );
}

// ----- proposed changes -----

function ActionOutcome({ action }: { action: AgentActionView }) {
  const { t, format } = useI18n();
  const result = action.result;
  if (!result) return null;
  if (!result.ok) return <p className="text-sm text-danger-ink">{result.error}</p>;
  const data = asData(result);
  switch (action.tool) {
    case "add_device":
      return <OutcomeLine text={t("ai.result.deviceAdded")} href={data.url as string} label={t("ai.result.openDevice")} />;
    case "add_browser_profile":
      return <OutcomeLine text={t("ai.result.profileAdded")} href={data.deviceId ? `/app/devices/${String(data.deviceId)}` : undefined} label={t("ai.result.openDevice")} />;
    case "add_provider":
      return <OutcomeLine text={t("ai.result.providerAdded")} href="/app/providers" label={t("ai.result.openProviders")} />;
    case "record_sign_ins": {
      const recorded = (data.recorded as unknown[]) ?? [];
      const skipped = (data.alreadySignedIn as unknown[]) ?? [];
      const place = data.place as { deviceId?: number; browserProfileId?: number | null } | undefined;
      const href = place?.deviceId ? `/app?device=${place.deviceId}${place.browserProfileId ? `&place=p:${place.browserProfileId}` : ""}` : undefined;
      return (
        <div className="space-y-1">
          <OutcomeLine text={t("ai.result.signInsRecorded", { count: format.number(recorded.length) })} href={href} label={t("ai.result.openMap")} />
          {skipped.length > 0 ? <OutcomeLine text={t("ai.result.alreadySignedIn", { count: format.number(skipped.length) })} tone="warn" /> : null}
        </div>
      );
    }
    case "sign_out":
      return <OutcomeLine text={t("ai.result.signedOut", { count: format.number(((data.signedOut as unknown[]) ?? []).length) })} />;
    case "confirm_sign_ins":
      return <OutcomeLine text={t("ai.result.confirmed", { count: format.number(Number(data.confirmed ?? 0)) })} />;
    case "mark_for_review":
      return <OutcomeLine text={data.review ? t("ai.result.marked", { count: format.number(Number(data.updated ?? 0)) }) : t("ai.result.unmarked", { count: format.number(Number(data.updated ?? 0)) })} />;
    case "update_account":
      return <OutcomeLine text={t("ai.result.accountUpdated")} href={data.id ? `/app/accounts/${String(data.id)}` : undefined} label={t("ai.result.openAccount")} />;
    default:
      return <OutcomeLine text={t("ai.statusDone")} />;
  }
}

function OutcomeLine({ text, tone = "ok", href, label }: { text: string; tone?: "ok" | "warn"; href?: string; label?: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className={cn("inline-flex items-center gap-1.5 font-semibold", tone === "ok" ? "text-ok-ink" : "text-warn-ink")}>
        {tone === "ok" ? <CircleCheck className="size-4" /> : <CircleAlert className="size-4" />}
        {text}
      </span>
      {href && label ? <PageLink href={href} label={label} /> : null}
    </p>
  );
}

const ACTION_TONES: Record<AgentActionView["status"], { badge: BadgeTone; icon: string }> = {
  pending: { badge: "warn", icon: "bg-warn-soft text-warn-ink" },
  running: { badge: "accent", icon: "bg-accent-soft text-accent" },
  done: { badge: "ok", icon: "bg-ok-soft text-ok-ink" },
  failed: { badge: "danger", icon: "bg-danger-soft text-danger-ink" },
  declined: { badge: "neutral", icon: "bg-sunken text-muted" },
};

export function ActionCard({
  action,
  busy,
  onConfirm,
  onDecline,
}: {
  action: AgentActionView;
  busy: boolean;
  onConfirm: (action: AgentActionView, secrets: Record<string, string>) => void;
  onDecline: (action: AgentActionView) => void;
}) {
  const { t } = useI18n();
  const [secret, setSecret] = useState("");
  const pending = action.status === "pending";
  const tone = ACTION_TONES[action.status];
  const secretField = action.preview.secret;
  const missingSecret = Boolean(secretField?.required && !secret.trim());
  const statusLabel = t.dynamic(`ai.status${action.status.charAt(0).toUpperCase()}${action.status.slice(1)}`);
  const toolLabel = t.dynamic(`ai.tools.${action.tool}`);
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-surface", pending ? "border-warn-line ring-4 ring-warn-soft" : "border-line")}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tone.icon)}>
          {action.status === "running" ? <Spinner /> : <ShieldQuestion className="size-[18px]" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">{action.preview.title}</p>
          {toolLabel !== action.preview.title ? <p className="text-xs text-muted">{toolLabel}</p> : null}
        </div>
        <Badge tone={tone.badge}>{statusLabel}</Badge>
      </div>
      {action.preview.fields.length > 0 ? (
        <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-[minmax(110px,max-content)_1fr]">
          {action.preview.fields.map((field, index) => (
            <div key={index} className="contents">
              <dt className="text-muted">{field.label}</dt>
              <dd className="min-w-0 break-words font-medium text-ink">
                {field.before ? <span className="mr-2 font-normal text-faint line-through">{field.before}</span> : null}
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {action.preview.note ? <p className="px-4 pb-3 text-xs text-muted">{action.preview.note}</p> : null}
      {pending && secretField ? (
        <div className="mx-4 mb-3 rounded-xl bg-subtle p-3">
          <Field label={secretField.label} htmlFor={`secret-${action.id}`} hint={secretField.hint}>
            <Input id={`secret-${action.id}`} type="password" autoComplete="new-password" value={secret} onChange={(event) => setSecret(event.target.value)} className="font-mono text-[13px]" />
          </Field>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <LockKeyhole className="size-3.5 text-ok" />
            {t("ai.secretNote")}
          </p>
        </div>
      ) : null}
      {pending ? (
        <div className="flex items-center justify-end gap-2 border-t border-line bg-subtle px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => onDecline(action)} disabled={busy}>
            {t("ai.decline")}
          </Button>
          <Button size="sm" onClick={() => onConfirm(action, secretField ? { [secretField.key]: secret } : {})} disabled={busy || missingSecret}>
            {secretField ? <KeyRound className="size-4" /> : <CircleCheck className="size-4" />}
            {t("ai.confirm")}
          </Button>
        </div>
      ) : action.status === "running" || action.status === "declined" ? null : (
        <div className="border-t border-line px-4 py-3">
          <ActionOutcome action={action} />
        </div>
      )}
    </div>
  );
}

// ----- a whole assistant message -----

export function AssistantMessage({
  message,
  continued,
  busy,
  onConfirm,
  onDecline,
}: {
  message: AgentMessageView;
  /** Follows another assistant message: no second avatar, tighter spacing. */
  continued: boolean;
  busy: boolean;
  onConfirm: (action: AgentActionView, secrets: Record<string, string>) => void;
  onDecline: (action: AgentActionView) => void;
}) {
  if (!message.content && message.toolCalls.length === 0) return null;
  return (
    <div className={cn("flex gap-3", continued && "-mt-3")}>
      {continued ? <span className="w-8 shrink-0" aria-hidden="true" /> : <AssistantAvatar className="mt-0.5" />}
      <div className="min-w-0 flex-1 space-y-3">
        {message.content ? <Markdown text={message.content} /> : null}
        <ToolSteps message={message} />
        {message.actions.map((action) => (
          <ActionCard key={action.id} action={action} busy={busy} onConfirm={onConfirm} onDecline={onDecline} />
        ))}
      </div>
    </div>
  );
}
