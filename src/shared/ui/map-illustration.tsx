import { Laptop, MonitorSmartphone, Smartphone, type LucideIcon } from "lucide-react";
import type { Translator } from "../i18n/translate";
import { cn } from "./cn";

/** Labels of the illustration, in the page's language (examples, not anyone's data). */
export type MapIllustrationLabels = {
  devices: string;
  places: string;
  accounts: string;
  deviceOffice: string;
  devicePhone: string;
  deviceHome: string;
  profileWork: string;
  profilePersonal: string;
  system: string;
  accountWork: string;
  accountCode: string;
  accountChat: string;
  confirmed: string;
};

export function illustrationLabels(t: Translator): MapIllustrationLabels {
  return {
    devices: t("illustration.devices"),
    places: t("illustration.places"),
    accounts: t("illustration.accounts"),
    deviceOffice: t("illustration.deviceOffice"),
    devicePhone: t("illustration.devicePhone"),
    deviceHome: t("illustration.deviceHome"),
    profileWork: t("illustration.profileWork"),
    profilePersonal: t("illustration.profilePersonal"),
    system: t("illustration.system"),
    accountWork: t("illustration.accountWork"),
    accountCode: t("illustration.accountCode"),
    accountChat: t("illustration.accountChat"),
    confirmed: t("illustration.confirmed"),
  };
}

function Row({ icon: Icon, label, detail, active, color, mono }: { icon?: LucideIcon; label: string; detail?: string; active?: boolean; color?: string; mono?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5", active ? "bg-white/10 ring-1 ring-inset ring-white/15" : "")}>
      {Icon ? (
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-white/80">
          <Icon className="size-3.5" />
        </span>
      ) : (
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[9px] font-extrabold text-white" style={{ backgroundColor: color }}>
          {label.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="min-w-0">
        <span className={cn("block truncate text-[11px] font-semibold text-white", mono && "font-mono")}>{label}</span>
        {detail ? <span className="block truncate text-[9.5px] text-white/50">{detail}</span> : null}
      </span>
    </div>
  );
}

/**
 * A small drawing of the sign-in map (device → place → accounts) for the landing and sign-in pages.
 * Decorative: it shows the idea with example labels, never real records.
 */
export function MapIllustration({ labels, className }: { labels: MapIllustrationLabels; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("rounded-2xl border border-white/10 bg-rail p-3 shadow-float", className)}>
      <div className="mb-3 flex items-center gap-1.5 px-1">
        <span className="size-2 rounded-full bg-white/20" />
        <span className="size-2 rounded-full bg-white/20" />
        <span className="size-2 rounded-full bg-white/20" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1 rounded-xl bg-white/[0.03] p-1.5">
          <p className="px-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-white/40">{labels.devices}</p>
          <Row icon={Laptop} label={labels.deviceOffice} detail="Windows" active />
          <Row icon={Smartphone} label={labels.devicePhone} detail="Android" />
          <Row icon={MonitorSmartphone} label={labels.deviceHome} detail="Windows" />
        </div>
        <div className="space-y-1 rounded-xl bg-white/[0.03] p-1.5">
          <p className="px-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-white/40">{labels.places}</p>
          <Row label={labels.profileWork} detail="Chrome" color="#4285F4" active />
          <Row label={labels.profilePersonal} detail="Chrome" color="#4285F4" />
          <Row label="Default" detail="Edge" color="#0C59A4" />
          <Row icon={MonitorSmartphone} label={labels.system} />
        </div>
        <div className="space-y-1 rounded-xl bg-white/[0.03] p-1.5">
          <p className="px-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-white/40">{labels.accounts}</p>
          <Row label={labels.accountWork} detail={`Google · ${labels.confirmed}`} color="#4285F4" mono active />
          <Row label={labels.accountCode} detail="GitHub" color="#24292F" mono />
          <Row label={labels.accountChat} detail="Slack" color="#4A154B" mono />
        </div>
      </div>
    </div>
  );
}
