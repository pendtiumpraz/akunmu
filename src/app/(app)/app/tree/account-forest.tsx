"use client";

import "@xyflow/react/dist/base.css";
import {
  Background,
  BackgroundVariant,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { ArrowUpRight, CheckCheck, GitBranch, History, Leaf, LogOut, Pencil, Plus, Search, Sprout, TreeDeciduous, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { buildForest, layoutForest, relatedToSignIn, type AccountTree, type LeafState, type PlacedAccount, type PlacedBranch, type PlacedWire } from "@/modules/signins/tree";
import { useI18n } from "@/shared/i18n/client";
import type { Translator } from "@/shared/i18n/translate";
import { Button, ButtonLink, IconButton } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import type { MapSignIn, TreeData } from "../map-types";
import { PlaceIcon, useSignInActions } from "../sign-in-actions";
import { APPROVAL_ICONS, DeviceIcon, Freshness, ProviderAvatar, approvalLabel, browserLabel, placeLabel, shortDate, systemLabel } from "../ui";

/**
 * The account trees (ComfyUI-like canvas): each account is a trunk, the devices it reached are roots and branches,
 * and the places on them are leaves. Wires show where an account was let in from (code, link, QR, prompt).
 * Pointing at a leaf lights up the places it grew from and grew into; a click opens it.
 */

type Row = MapSignIn;
type Lit = { signIns: Set<number>; branches: Set<string>; tree: string } | null;

type TrunkData = { placed: PlacedAccount<Row>; dimmed: boolean };
type BranchData = {
  placed: PlacedBranch<Row>;
  dimmed: boolean;
  /** Sign-ins lit in this tree (null when nothing is pointed at here). */
  lit: Set<number> | null;
  selectedId: number | null;
  onHover: (id: number | null) => void;
  onSelect: (id: number) => void;
};
type WireData = { wire: PlacedWire; dimmed: boolean; active: boolean };
type TrunkFlowNode = Node<TrunkData, "account">;
type BranchFlowNode = Node<BranchData, "branch">;
type WireFlowEdge = Edge<WireData, "wire">;

const NODE_TYPES = { account: TrunkNode, branch: BranchNode };
const EDGE_TYPES = { wire: Wire };

/** Where the trees open when they do not all fit at a readable size: the top left, under the toolbar. */
const START = { x: 32, y: 84 };
const LEGEND_KEY = "akunmu.treeLegend";

function legendStartsOpen(): boolean {
  try {
    return window.localStorage.getItem(LEGEND_KEY) !== "closed";
  } catch {
    return true;
  }
}

function depthStyle(depth: number): CSSProperties {
  return { "--depth": depth } as CSSProperties;
}

function matches(tree: AccountTree<Row>, needle: string): boolean {
  const text = [tree.account.identifier, tree.account.label ?? "", tree.provider.name, ...tree.branches.map((branch) => branch.device.name)].join(" ").toLowerCase();
  return text.includes(needle);
}

/**
 * What lights up: the lineage of the leaf pointed at (or selected); else, under the pointer, a whole tree (its
 * trunk) or the lineage of every leaf of a device.
 */
function litFor(trees: AccountTree<Row>[], signInId: number | null, nodeId: string | null): Lit {
  if (signInId !== null) {
    const tree = trees.find((candidate) => candidate.branches.some((branch) => branch.leaves.some((leaf) => leaf.row.id === signInId)));
    return tree ? { ...relatedToSignIn(tree, signInId), tree: tree.key } : null;
  }
  if (nodeId === null) return null;
  const tree = trees.find((candidate) => candidate.key === nodeId || candidate.branches.some((branch) => branch.key === nodeId));
  if (!tree) return null;
  if (tree.key === nodeId) {
    return { signIns: new Set(tree.branches.flatMap((branch) => branch.leaves.map((leaf) => leaf.row.id))), branches: new Set(tree.branches.map((branch) => branch.key)), tree: tree.key };
  }
  const lit = { signIns: new Set<number>(), branches: new Set<string>([nodeId]), tree: tree.key };
  for (const leaf of tree.branches.find((branch) => branch.key === nodeId)?.leaves ?? []) {
    const related = relatedToSignIn(tree, leaf.row.id);
    related.signIns.forEach((id) => lit.signIns.add(id));
    related.branches.forEach((key) => lit.branches.add(key));
  }
  return lit;
}

function leafTitle(row: Row, t: Translator): string {
  if (row.profile) return row.profile.name;
  return row.app ?? t("signIns.deviceItself");
}

function leafDetail(row: Row, t: Translator): string {
  if (row.profile) return browserLabel(row.profile.browser, t);
  if (row.app) return t.dynamic(`signIns.appKind_${row.appKind ?? "app"}`);
  return systemLabel(row.device.system, t);
}

export function AccountForest(props: { data: TreeData; reload: () => void; canWrite: boolean; onRecord: () => void }) {
  return (
    <ReactFlowProvider>
      <Forest {...props} />
    </ReactFlowProvider>
  );
}

function Forest({ data, reload, canWrite, onRecord }: { data: TreeData; reload: () => void; canWrite: boolean; onRecord: () => void }) {
  const { t, format } = useI18n();
  const { fitView, setViewport } = useReactFlow();
  const { actions, dialogs } = useSignInActions(reload);
  const canvas = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1.6);
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState(false);
  const [legendOpen, setLegendOpen] = useState(legendStartsOpen);
  const [hovered, setHovered] = useState<number | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
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
      if (width > 0 && height > 0) setAspect(Math.round((width / height) * 4) / 4);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const forest = useMemo(() => buildForest(data.signIns, { staleBefore: data.staleBefore, history }), [data, history]);
  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => (needle ? forest.filter((tree) => matches(tree, needle)) : forest), [forest, needle]);
  const layout = useMemo(() => layoutForest(shown, { aspect }), [shown, aspect]);

  // Frame the trees whenever what is drawn changes: all of them when they fit at a readable size, otherwise the top
  // left at that size (the mini map and search reach the rest).
  const drawn = `${history}|${needle}|${layout.nodes.length}|${aspect}`;
  useEffect(() => {
    const element = canvas.current;
    if (!element || layout.nodes.length === 0) return;
    const frame = requestAnimationFrame(() => {
      const { width, height } = element.getBoundingClientRect();
      const readable = width < 640 ? 0.55 : 0.8;
      const fits = Math.min((width - 96) / layout.width, (height - 140) / layout.height);
      if (fits >= readable) void fitView({ padding: 0.12, maxZoom: 1, duration: 300 });
      else void setViewport({ ...START, zoom: readable }, { duration: 300 });
    });
    return () => cancelAnimationFrame(frame);
  }, [drawn, layout, fitView, setViewport]);

  const toggleLegend = (open: boolean) => {
    setLegendOpen(open);
    try {
      window.localStorage.setItem(LEGEND_KEY, open ? "open" : "closed");
    } catch {
      // Private windows may refuse storage; the legend just opens again next time.
    }
  };

  const lit = litFor(shown, hovered ?? selectedId, hoveredNode);

  const nodes: (TrunkFlowNode | BranchFlowNode)[] = layout.nodes.map((placed) =>
    placed.kind === "account"
      ? {
          id: placed.id,
          type: "account",
          position: { x: placed.x, y: placed.y },
          width: placed.width,
          height: placed.height,
          data: { placed, dimmed: lit !== null && lit.tree !== placed.id },
        }
      : {
          id: placed.id,
          type: "branch",
          position: { x: placed.x, y: placed.y },
          width: placed.width,
          height: placed.height,
          data: {
            placed,
            dimmed: lit !== null && !lit.branches.has(placed.id),
            lit: lit && lit.tree === placed.tree.key ? lit.signIns : null,
            selectedId,
            onHover: setHovered,
            onSelect: setSelectedId,
          },
        },
  );
  const edges: WireFlowEdge[] = layout.wires.map((wire) => {
    const active =
      lit !== null &&
      (wire.kind === "trunk" ? lit.tree === wire.source && lit.branches.has(wire.target) : lit.signIns.has(wire.fromId ?? -1) && lit.signIns.has(wire.toId ?? -1));
    return {
      id: wire.id,
      type: "wire",
      source: wire.source,
      sourceHandle: wire.sourceHandle,
      target: wire.target,
      targetHandle: wire.targetHandle,
      data: { wire, dimmed: lit !== null && !active, active },
    };
  });

  const devices = new Set(shown.flatMap((tree) => tree.branches.map((branch) => branch.device.id))).size;
  const leaves = shown.reduce((sum, tree) => sum + tree.stats.leaves, 0);
  const wilting = shown.reduce((sum, tree) => sum + tree.stats.wilting, 0);

  const byId = new Map(data.signIns.map((row) => [row.id, row]));
  const selected = selectedId !== null ? (byId.get(selectedId) ?? null) : null;
  const origin = selected?.approvedFromId ? (byId.get(selected.approvedFromId) ?? null) : null;
  const grown = selected ? data.signIns.filter((row) => row.approvedFromId === selected.id) : [];

  return (
    <div
      ref={canvas}
      className={cn("tree-canvas relative h-[calc(100dvh-15rem)] min-h-[440px] overflow-hidden rounded-panel border border-line sm:h-[calc(100dvh-11.5rem)]", settled && "tree-settled")}
      aria-label={t("tree.title")}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
                className="h-8 w-40 rounded-lg bg-subtle pl-8 pr-2 text-[13px] text-ink outline-none placeholder:text-faint focus:ring-2 focus:ring-accent-line sm:w-52"
              />
            </label>
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
            <span className="hidden items-center gap-3 px-2 text-xs text-muted md:flex">
              <span className="inline-flex items-center gap-1">
                <TreeDeciduous className="size-3.5 text-ok" />
                {t("tree.countTrees", { count: format.number(shown.length) })}
              </span>
              <span className="inline-flex items-center gap-1">
                <Leaf className="size-3.5 text-ok" />
                {t("tree.countLeaves", { count: format.number(leaves), devices: format.number(devices) })}
              </span>
              {wilting > 0 ? (
                <span className="inline-flex items-center gap-1 font-semibold text-warn-ink">
                  <Leaf className="size-3.5 text-warn" />
                  {t("tree.countWilting", { count: format.number(wilting) })}
                </span>
              ) : null}
            </span>
          </div>
        </Panel>
        <Panel position="top-right" className={cn("!m-3 hidden xl:block", selected && "!hidden")}>
          {legendOpen ? (
            <Legend onClose={() => toggleLegend(false)} />
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
          nodeColor={(node) => (node.type === "account" ? "var(--trunk-bg)" : "var(--line-strong)")}
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
      ) : shown.length === 0 ? (
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

function Legend({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const items: { icon: ReactNode; label: string }[] = [
    { icon: <span className="block size-3 rounded-[4px] bg-trunk ring-1 ring-line-strong" />, label: t("tree.legendTrunk") },
    { icon: <Sprout className="size-3.5 text-bark" />, label: t("tree.legendRoot") },
    { icon: <GitBranch className="size-3.5 text-accent" />, label: t("tree.legendBranch") },
    { icon: <LeafMark state="fresh" bare />, label: t("tree.leaf_fresh") },
    { icon: <LeafMark state="wilting" bare />, label: t("tree.leaf_wilting") },
    { icon: <LeafMark state="fallen" bare />, label: t("tree.leaf_fallen") },
  ];
  return (
    <div className="w-60 rounded-xl border border-line bg-surface/95 p-3 shadow-float backdrop-blur">
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

function LeafMark({ state, bare = false }: { state: LeafState; bare?: boolean }) {
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

function MethodChip({ method }: { method: Row["approvalMethod"] }) {
  const { t } = useI18n();
  const Icon = method ? APPROVAL_ICONS[method] : GitBranch;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent-line bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
      <Icon className="size-3" />
      {approvalLabel(method, t)}
    </span>
  );
}

/** The trunk: the account, its provider and how far it spread. Click to frame its tree. */
function TrunkNode({ data }: NodeProps<TrunkFlowNode>) {
  const { t, format } = useI18n();
  const { fitView } = useReactFlow();
  const { tree } = data.placed;
  const frame = () => void fitView({ nodes: [{ id: tree.key }, ...tree.branches.map((branch) => ({ id: branch.key }))], padding: 0.2, maxZoom: 1.1, duration: 450 });
  return (
    <div className={cn("tree-node tree-trunk relative size-full rounded-2xl transition-transform duration-200 hover:-translate-y-0.5", data.dimmed && "tree-dim")} style={depthStyle(0)}>
      <button type="button" onClick={frame} title={t("tree.frameTree")} className="flex size-full items-center gap-3 rounded-2xl px-4 text-left">
        <ProviderAvatar provider={tree.provider} size="lg" className="ring-2 ring-white/15" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[13px] font-semibold text-white">{tree.account.identifier}</span>
          <span className="block truncate text-xs text-white/60">{[tree.provider.name, tree.account.label].filter(Boolean).join(" · ")}</span>
          <span className="mt-1.5 flex items-center gap-2 text-[11px] font-medium text-white/75">
            <TreeDeciduous className="size-3.5 text-[#6ee7b7]" />
            {t("tree.trunkStats", { devices: format.number(tree.stats.devices), leaves: format.number(tree.stats.leaves) })}
            {tree.stats.wilting > 0 ? (
              <span className="inline-flex items-center gap-0.5 text-[#fcd34d]">
                <Leaf className="size-3" />
                {format.number(tree.stats.wilting)}
              </span>
            ) : null}
          </span>
        </span>
      </button>
      <Handle type="source" position={Position.Right} id="trunk" isConnectable={false} className="tree-port tree-port-trunk" />
    </div>
  );
}

/** A device on the tree: a root (signed in directly) or a branch (reached from another device), with its leaves. */
function BranchNode({ data }: NodeProps<BranchFlowNode>) {
  const { t } = useI18n();
  const { branch, ports } = data.placed;
  const root = branch.parentKey === null;
  return (
    <div className={cn("tree-node relative flex size-full flex-col rounded-xl border bg-surface shadow-card", root ? "border-line-strong" : "border-line", data.dimmed && "tree-dim")} style={depthStyle(branch.depth)}>
      <header className="relative flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line px-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2">
          <DeviceIcon kind={branch.device.kind} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold text-ink">{branch.device.name}</span>
          <span className="block truncate text-[11px] text-muted">{systemLabel(branch.device.system, t)}</span>
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            root ? "bg-bark-soft text-bark" : "bg-accent-soft text-accent",
          )}
        >
          {root ? <Sprout className="size-3" /> : <GitBranch className="size-3" />}
          {root ? t("tree.root") : t("tree.branch")}
        </span>
        {ports.header ? <Handle type="target" position={Position.Left} id="in" isConnectable={false} className="tree-port tree-port-trunk" /> : null}
      </header>
      <ul>
        {branch.leaves.map((leaf) => {
          const id = leaf.row.id;
          const selected = data.selectedId === id;
          const faded = data.lit !== null && !data.lit.has(id);
          return (
            <li key={id} className="relative h-[44px]">
              <button
                type="button"
                onMouseEnter={() => data.onHover(id)}
                onMouseLeave={() => data.onHover(null)}
                onFocus={() => data.onHover(id)}
                onBlur={() => data.onHover(null)}
                onClick={() => data.onSelect(id)}
                aria-pressed={selected}
                className={cn(
                  "group flex size-full items-center gap-2.5 px-3 text-left transition-[background-color,opacity] duration-150 hover:bg-subtle",
                  selected && "bg-accent-soft hover:bg-accent-soft",
                  faded && "opacity-40",
                  leaf.state === "fallen" && "opacity-60",
                )}
              >
                <PlaceIcon row={leaf.row} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-[13px] font-semibold text-ink", leaf.state === "fallen" && "line-through decoration-faint")}>{leafTitle(leaf.row, t)}</span>
                  <span className="block truncate text-[11px] text-muted">{leafDetail(leaf.row, t)}</span>
                </span>
                <LeafMark state={leaf.state} />
              </button>
              {ports.leafIn.includes(id) ? <Handle type="target" position={Position.Left} id={`in-${id}`} isConnectable={false} className="tree-port" /> : null}
              {ports.leafOut.includes(id) ? <Handle type="source" position={Position.Right} id={`out-${id}`} isConnectable={false} className="tree-port" /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A wire: thick bark from the trunk, an approval (with how) between devices; lit wires show a flow. */
function Wire({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<WireFlowEdge>) {
  const { t } = useI18n();
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.45 });
  if (!data) return null;
  const { wire } = data;
  const Icon = wire.method ? APPROVAL_ICONS[wire.method] : GitBranch;
  return (
    <>
      <path
        id={id}
        d={path}
        fill="none"
        pathLength={wire.kind === "cross" ? undefined : 1}
        className={cn("tree-wire", `tree-wire-${wire.kind}`, data.dimmed && "tree-dim", data.active && "tree-wire-lit")}
        style={depthStyle(wire.depth)}
      />
      {data.active ? <path d={path} fill="none" className="tree-wire-flow" /> : null}
      {wire.kind !== "trunk" ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "tree-wire-label pointer-events-none absolute inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              data.active ? "border-accent bg-accent text-on-primary" : "border-accent-line bg-surface text-accent",
              data.dimmed && "tree-dim",
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, ...depthStyle(wire.depth) }}
          >
            <Icon className="size-3" />
            {approvalLabel(wire.method, t)}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
