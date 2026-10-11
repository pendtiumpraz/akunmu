"use client";

import { EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { GitBranch, Leaf } from "lucide-react";
import type { CSSProperties } from "react";
import type { LeafState } from "@/modules/signins/tree";
import type { ApprovalMethod } from "@/modules/signins/types";
import { useI18n } from "@/shared/i18n/client";
import type { Translator } from "@/shared/i18n/translate";
import { cn } from "@/shared/ui/cn";
import type { MapSignIn } from "../map-types";
import { APPROVAL_ICONS, approvalLabel, browserLabel, systemLabel } from "../ui";

/** Pieces both tree views share: the sign-in rows they read, wires, leaf marks and approval chips. */

export type Row = MapSignIn;

/**
 * trunk: from a trunk (account or device) to what grows on it; branch: from a place to its providers; graft: an
 * approval between two sessions (with how); cross: two sessions of the same account (shown while one is lit).
 */
export type WireKind = "trunk" | "branch" | "graft" | "cross";
export type WireData = { kind: WireKind; method: ApprovalMethod | null; depth: number; dimmed: boolean; active: boolean; live?: boolean };
export type WireFlowEdge = Edge<WireData, "wire">;

export function depthStyle(depth: number): CSSProperties {
  return { "--depth": depth } as CSSProperties;
}

/** A place's name: the browser profile, the app, or "Device itself". */
export function placeTitle(row: Row, t: Translator): string {
  if (row.profile) return row.profile.name;
  return row.app ?? t("signIns.deviceItself");
}

/** What a place is: the browser, "App" / "Command line (CLI)", or the device's system. */
export function placeDetail(row: Row, t: Translator): string {
  if (row.profile) return browserLabel(row.profile.browser, t);
  if (row.app) return t.dynamic(`signIns.appKind_${row.appKind ?? "app"}`);
  return systemLabel(row.device.system, t);
}

export function LeafMark({ state, bare = false }: { state: LeafState; bare?: boolean }) {
  const { t } = useI18n();
  const icon = (
    <Leaf
      className={cn(
        "size-3.5 transition-transform duration-300",
        state === "fallen" ? "rotate-[120deg]" : "group-hover:-rotate-12",
        state === "fresh" ? "text-ok" : state === "wilting" ? "text-warn" : "text-faint",
      )}
    />
  );
  if (bare) return icon;
  return (
    <span
      title={t.dynamic(`tree.leaf_${state}`)}
      className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full", state === "fresh" ? "bg-ok-soft" : state === "wilting" ? "bg-warn-soft" : "bg-sunken")}
    >
      {icon}
      <span className="sr-only">{t.dynamic(`tree.leaf_${state}`)}</span>
    </span>
  );
}

export function MethodChip({ method }: { method: ApprovalMethod | null }) {
  const { t } = useI18n();
  const Icon = method ? APPROVAL_ICONS[method] : GitBranch;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent-line bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
      <Icon className="size-3" />
      {approvalLabel(method, t)}
    </span>
  );
}

/** A wire: bark from a trunk, approvals (with how) and same-account links in the accent color; lit wires flow. */
export function Wire({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<WireFlowEdge>) {
  const { t } = useI18n();
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.45 });
  if (!data) return null;
  const Icon = data.method ? APPROVAL_ICONS[data.method] : GitBranch;
  return (
    <>
      <path
        id={id}
        d={path}
        fill="none"
        pathLength={data.kind === "cross" ? undefined : 1}
        className={cn("tree-wire", `tree-wire-${data.kind}`, data.live && data.kind === "graft" && "tree-wire-live", data.dimmed && "tree-dim", data.active && "tree-wire-lit")}
        style={depthStyle(data.depth)}
      />
      {data.active ? <path d={path} fill="none" className="tree-wire-flow" /> : null}
      {data.kind === "graft" ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "tree-wire-label pointer-events-none absolute inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              data.active ? "border-accent bg-accent text-on-primary" : "border-accent-line bg-surface text-accent",
              data.dimmed && "tree-dim",
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, ...depthStyle(data.depth) }}
          >
            <Icon className="size-3" />
            {approvalLabel(data.method, t)}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
