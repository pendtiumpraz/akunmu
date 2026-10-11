"use client";

import "@xyflow/react/dist/base.css";
import { Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow, type Node } from "@xyflow/react";
import { ArrowUpRight, AtSign, Boxes, CheckCheck, GitBranch, History, KeyRound, Laptop, Leaf, LogOut, Pencil, Plus, Search, Sprout, TreeDeciduous, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/shared/i18n/client";
import { Button, ButtonLink, IconButton } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import type { TreeData } from "../map-types";
import { PlaceIcon, useSignInActions } from "../sign-in-actions";
import { Freshness, ProviderAvatar, placeLabel, shortDate } from "../ui";
import { ACCOUNT_NODE_TYPES, accountFlow, accountFrame, accountScene, accountStats, type SceneView } from "./account-mode";
import { DEVICE_NODE_TYPES, deviceFlow, deviceFrame, deviceScene, deviceStats } from "./device-mode";
import { LeafMark, MethodChip, Wire, type WireFlowEdge } from "./parts";

/**
 * The trees canvas (ComfyUI-like, React Flow). Two ways to grow the forest:
 * - by device (the default): device → browser profiles, apps and CLIs → providers → login sessions;
 * - by account: account → the devices it was signed in on directly → the devices it reached from there.
 * Pointing at a session lights where else its account is and how it got there; a click opens it.
 */

export type TreeMode = "device" | "account";
export type TreeFocus = { kind: TreeMode; id: number };

const NODE_TYPES = { ...DEVICE_NODE_TYPES, ...ACCOUNT_NODE_TYPES };
const EDGE_TYPES = { wire: Wire };

/** Where the trees open when they do not all fit at a readable size: the top left, under the toolbar. */
const START = { x: 32, y: 84 };
const LEGEND_KEY = "akunmu.treeLegend";
const EMPTY_LAYOUT = { nodes: [], width: 0, height: 0 };

function legendStartsOpen(): boolean {
  try {
    return window.localStorage.getItem(LEGEND_KEY) !== "closed";
  } catch {
    return true;
  }
}

export function TreeCanvas(props: { data: TreeData; reload: () => void; canWrite: boolean; onRecord: () => void; focus?: TreeFocus | null }) {
  return (
    <ReactFlowProvider>
      <Forest {...props} />
    </ReactFlowProvider>
  );
}

function Forest({ data, reload, canWrite, onRecord, focus = null }: { data: TreeData; reload: () => void; canWrite: boolean; onRecord: () => void; focus?: TreeFocus | null }) {
  const { t, format } = useI18n();
  const { fitView, setViewport } = useReactFlow();
  const { actions, dialogs } = useSignInActions(reload);
  const canvas = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<TreeMode>(focus?.kind ?? "device");
  // The canvas's width / height, measured once mounted; nothing is framed before (the packing depends on it).
  const [measured, setMeasured] = useState<number | null>(null);
  const aspect = measured ?? 1.6;
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState(false);
  const [legendOpen, setLegendOpen] = useState(legendStartsOpen);
  const [hovered, setHovered] = useState<number | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const pendingFocus = useRef<TreeFocus | null>(focus);
  const initialized = useNodesInitialized();
  const [settled, setSettled] = useState(false);

  // The wires draw themselves once; after that (React Flow may mount them again, e.g. when a leaf off screen gets
  // focus) they show at once.
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  // The trees are packed into columns that fit the canvas's shape.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setMeasured(Math.round((width / height) * 4) / 4);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const needle = query.trim().toLowerCase();
  const byDevice = useMemo(
    () => (mode === "device" ? deviceScene(data.signIns, { staleBefore: data.staleBefore, history, needle, aspect }) : null),
    [mode, data, history, needle, aspect],
  );
  const byAccount = useMemo(
    () => (mode === "account" ? accountScene(data.signIns, { staleBefore: data.staleBefore, history, needle, aspect }) : null),
    [mode, data, history, needle, aspect],
  );
  const layout = useMemo(() => byDevice?.layout ?? byAccount?.layout ?? EMPTY_LAYOUT, [byDevice, byAccount]);

  // Frame the trees whenever what is drawn changes: a tree asked for in the address first, else all of them when they
  // fit at a readable size, otherwise the top left at that size (the mini map and search reach the rest).
  // The focus is used once, as soon as the nodes are measured; kept in a ref so using it does not frame again.
  const drawn = `${mode}|${history}|${needle}|${layout.nodes.length}|${aspect}`;
  useEffect(() => {
    const element = canvas.current;
    if (!element || layout.nodes.length === 0 || !initialized || measured === null) return;
    const frame = requestAnimationFrame(() => {
      const target = pendingFocus.current;
      if (target) {
        pendingFocus.current = null;
        const ids = target.kind === "device" && byDevice ? deviceFrame(byDevice, target.id) : target.kind === "account" && byAccount ? accountFrame(byAccount, target.id) : null;
        if (ids) {
          void fitView({ nodes: ids.map((id) => ({ id })), padding: 0.2, maxZoom: 1.1, duration: 300 });
          return;
        }
      }
      const { width, height } = element.getBoundingClientRect();
      const readable = width < 640 ? 0.55 : 0.8;
      const fits = Math.min((width - 96) / layout.width, (height - 140) / layout.height);
      if (fits >= readable) void fitView({ padding: 0.12, maxZoom: 1, duration: 300 });
      else void setViewport({ ...START, zoom: readable }, { duration: 300 });
    });
    return () => cancelAnimationFrame(frame);
  }, [drawn, layout, initialized, measured, byDevice, byAccount, fitView, setViewport]);

  const toggleLegend = (open: boolean) => {
    setLegendOpen(open);
    try {
      window.localStorage.setItem(LEGEND_KEY, open ? "open" : "closed");
    } catch {
      // Private windows may refuse storage; the legend just opens again next time.
    }
  };
  const switchMode = (next: TreeMode) => {
    setMode(next);
    setHovered(null);
    setHoveredNode(null);
  };

  const view: SceneView = { pointedId: hovered ?? selectedId, hoveredNode, selectedId, onHover: setHovered, onSelect: setSelectedId };
  const flow: { nodes: Node[]; edges: WireFlowEdge[] } = byDevice ? deviceFlow(byDevice, view, data.signIns, t) : byAccount ? accountFlow(byAccount, view) : { nodes: [], edges: [] };
  const stats = byDevice ? deviceStats(byDevice) : byAccount ? accountStats(byAccount) : null;

  const byId = new Map(data.signIns.map((row) => [row.id, row]));
  const selected = selectedId !== null ? (byId.get(selectedId) ?? null) : null;
  const origin = selected?.approvedFromId ? (byId.get(selected.approvedFromId) ?? null) : null;
  const grown = selected ? data.signIns.filter((row) => row.approvedFromId === selected.id) : [];
  const sameAccount = selected ? data.signIns.filter((row) => row.account.id === selected.account.id && row.id !== selected.id && row.status === "signed_in") : [];

  return (
    <div
      ref={canvas}
      className={cn("tree-canvas relative h-[calc(100dvh-15rem)] min-h-[440px] overflow-hidden rounded-panel border border-line sm:h-[calc(100dvh-11.5rem)]", settled && "tree-settled")}
      aria-label={t("tree.title")}
    >
      <ReactFlow
        nodes={flow.nodes}
        edges={flow.edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        defaultViewport={{ ...START, zoom: 0.8 }}
        minZoom={0.1}
        maxZoom={1.75}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        zoomOnDoubleClick={false}
        attributionPosition="bottom-left"
        onPaneClick={() => setSelectedId(null)}
        onNodeMouseEnter={(_, node) => setHoveredNode(node.id)}
        onNodeMouseLeave={() => setHoveredNode(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
        <Panel position="top-left" className="!m-2 sm:!m-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface/95 p-1.5 shadow-float backdrop-blur">
            <label className="relative">
              <span className="sr-only">{t("tree.search")}</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("tree.search")}
                className="h-8 w-40 rounded-lg bg-subtle pl-8 pr-2 text-[13px] text-ink outline-none placeholder:text-faint focus:ring-2 focus:ring-accent-line sm:w-48"
              />
            </label>
            <div role="radiogroup" aria-label={t("tree.mode")} className="inline-flex rounded-lg bg-subtle p-0.5">
              {(
                [
                  ["device", Laptop, t("tree.modeDevice")],
                  ["account", AtSign, t("tree.modeAccount")],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => switchMode(value)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[12px] font-semibold transition-colors",
                    mode === value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-pressed={history}
              onClick={() => setHistory((value) => !value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-colors",
                history ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-subtle",
              )}
            >
              <History className="size-3.5" />
              {t("tree.history")}
            </button>
            {stats ? (
              <span className="hidden items-center gap-3 px-2 text-xs text-muted lg:flex">
                <span className="inline-flex items-center gap-1">
                  <TreeDeciduous className="size-3.5 text-ok" />
                  {mode === "device" ? t("tree.countDevices", { count: format.number(stats.trees) }) : t("tree.countTrees", { count: format.number(stats.trees) })}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Leaf className="size-3.5 text-ok" />
                  {t("tree.countSessions", { count: format.number(stats.sessions) })}
                </span>
                {stats.wilting > 0 ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-warn-ink">
                    <Leaf className="size-3.5 text-warn" />
                    {t("tree.countWilting", { count: format.number(stats.wilting) })}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </Panel>
        <Panel position="top-right" className={cn("!m-3 hidden xl:block", selected && "!hidden")}>
          {legendOpen ? (
            <Legend mode={mode} onClose={() => toggleLegend(false)} />
          ) : (
            <button
              type="button"
              onClick={() => toggleLegend(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface/95 px-2.5 text-[12px] font-semibold text-ink-2 shadow-float backdrop-blur hover:text-ink"
            >
              <Leaf className="size-3.5 text-ok" />
              {t("tree.legendTitle")}
            </button>
          )}
        </Panel>
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          className="!hidden md:!block"
          style={{ width: 176, height: 116, marginBottom: 124 }}
          bgColor="var(--surface)"
          maskColor="color-mix(in oklab, var(--canvas) 72%, transparent)"
          nodeColor={(node) => (node.type === "account" || node.type === "device" ? "var(--trunk-bg)" : "var(--line-strong)")}
        />
      </ReactFlow>

      {data.signIns.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-float">
            <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-ok-soft text-ok">
              <Sprout className="size-6" />
            </span>
            <h2 className="mt-3 text-lg font-extrabold tracking-tight text-ink">{t("tree.emptyTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("tree.emptyBody")}</p>
            {canWrite ? (
              <Button className="mt-4" icon={<Plus className="size-4" />} onClick={onRecord}>
                {t("signIns.recordButton")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : layout.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto rounded-2xl border border-line bg-surface px-5 py-4 text-center shadow-float">
            <p className="text-sm font-semibold text-ink">{t("tree.noMatch")}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setQuery("")}>
              {t("tree.clearSearch")}
            </Button>
          </div>
        </div>
      ) : null}

      {selected ? (
        <aside
          className="absolute inset-x-2 bottom-2 z-10 max-h-[58%] animate-pop overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-float sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-[328px]"
          aria-label={t("tree.inspector")}
        >
          <header className="flex items-start gap-3">
            <ProviderAvatar provider={selected.provider} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[13px] font-semibold text-ink">{selected.account.identifier}</p>
              <p className="truncate text-xs text-muted">{[selected.provider.name, selected.account.label].filter(Boolean).join(" · ")}</p>
            </div>
            <IconButton label={t("common.close")} onClick={() => setSelectedId(null)}>
              <X className="size-4" />
            </IconButton>
          </header>
          <div className="mt-4 rounded-xl bg-subtle p-3">
            <div className="flex items-center gap-2.5">
              <PlaceIcon row={selected} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{placeLabel(selected, t)}</p>
                <p className="truncate text-xs text-muted">{selected.device.name}</p>
              </div>
            </div>
            <p className="mt-2 text-xs">
              {selected.status === "signed_in" ? (
                <Freshness lastVerifiedAt={selected.lastVerifiedAt} stale={selected.review || selected.lastVerifiedAt < data.staleBefore} />
              ) : (
                <span className="text-faint">{selected.signedOutAt ? t("signIns.signedOutOn", { date: shortDate(selected.signedOutAt, format) }) : t("signIns.signedOutStatus")}</span>
              )}
            </p>
          </div>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-faint">{t("tree.grewFrom")}</dt>
              <dd className="mt-1 text-sm">
                {origin ? (
                  <button type="button" onClick={() => setSelectedId(origin.id)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-subtle">
                    <PlaceIcon row={origin} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{origin.device.name}</span>
                      <span className="block truncate text-xs text-muted">{placeLabel(origin, t)}</span>
                    </span>
                    <MethodChip method={selected.approvalMethod} />
                  </button>
                ) : (
                  <span className="text-muted">{selected.approvedFromId ? t("tree.originRemoved") : t("tree.direct")}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-faint">{t("tree.grewInto")}</dt>
              <dd className="mt-1 space-y-1 text-sm">
                {grown.length === 0 ? (
                  <span className="text-muted">{t("tree.grewIntoNone")}</span>
                ) : (
                  grown.map((row) => (
                    <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-subtle">
                      <PlaceIcon row={row} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{row.device.name}</span>
                        <span className="block truncate text-xs text-muted">{placeLabel(row, t)}</span>
                      </span>
                      <MethodChip method={row.approvalMethod} />
                    </button>
                  ))
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-faint">{t("tree.alsoSignedIn", { count: format.number(sameAccount.length) })}</dt>
              <dd className="mt-1 space-y-1 text-sm">
                {sameAccount.length === 0 ? (
                  <span className="text-muted">{t("tree.onlyHere")}</span>
                ) : (
                  sameAccount.map((row) => (
                    <button key={row.id} type="button" onClick={() => setSelectedId(row.id)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-subtle">
                      <PlaceIcon row={row} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{row.device.name}</span>
                        <span className="block truncate text-xs text-muted">{placeLabel(row, t)}</span>
                      </span>
                    </button>
                  ))
                )}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
            {canWrite && selected.status === "signed_in" ? (
              <Button size="sm" variant="secondary" icon={<CheckCheck className="size-4" />} onClick={() => actions.confirm(selected)}>
                {t("signIns.confirm")}
              </Button>
            ) : null}
            {canWrite ? (
              <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} onClick={() => actions.edit(selected)}>
                {t("tree.editOrigin")}
              </Button>
            ) : null}
            {canWrite && selected.status === "signed_in" ? (
              <Button size="sm" variant="ghost" icon={<LogOut className="size-4" />} onClick={() => actions.askSignOut(selected)}>
                {t("signIns.signOut")}
              </Button>
            ) : null}
            <ButtonLink href={`/app/accounts/${selected.account.id}`} size="sm" variant="ghost" icon={<ArrowUpRight className="size-4" />}>
              {t("tree.openAccount")}
            </ButtonLink>
          </div>
        </aside>
      ) : null}
      {dialogs}
    </div>
  );
}

function Legend({ mode, onClose }: { mode: TreeMode; onClose: () => void }) {
  const { t } = useI18n();
  const trunk = <span className="block size-3 rounded-[4px] bg-trunk ring-1 ring-line-strong" />;
  const leaves: { icon: ReactNode; label: string }[] = [
    { icon: <LeafMark state="fresh" bare />, label: t("tree.leaf_fresh") },
    { icon: <LeafMark state="wilting" bare />, label: t("tree.leaf_wilting") },
    { icon: <LeafMark state="fallen" bare />, label: t("tree.leaf_fallen") },
  ];
  const items: { icon: ReactNode; label: string }[] =
    mode === "device"
      ? [
          { icon: trunk, label: t("tree.legendDevice") },
          { icon: <GitBranch className="size-3.5 text-bark" />, label: t("tree.legendPlace") },
          { icon: <Boxes className="size-3.5 text-ink-2" />, label: t("tree.legendProvider") },
          ...leaves,
          { icon: <KeyRound className="size-3.5 text-accent" />, label: t("tree.legendGraft") },
          { icon: <span className="block h-0 w-3.5 border-t-2 border-dashed border-accent" />, label: t("tree.legendCross") },
        ]
      : [
          { icon: trunk, label: t("tree.legendTrunk") },
          { icon: <Sprout className="size-3.5 text-bark" />, label: t("tree.legendRoot") },
          { icon: <GitBranch className="size-3.5 text-accent" />, label: t("tree.legendBranch") },
          ...leaves,
        ];
  return (
    <div className="w-64 rounded-xl border border-line bg-surface/95 p-3 shadow-float backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-faint">{t("tree.legendTitle")}</p>
        <button type="button" onClick={onClose} aria-label={t("common.close")} title={t("common.close")} className="-m-1 rounded-md p-1 text-faint hover:bg-subtle hover:text-ink">
          <X className="size-3.5" />
        </button>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-[12px] text-ink-2">
            <span className="inline-flex w-4 shrink-0 justify-center">{item.icon}</span>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
