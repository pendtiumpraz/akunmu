"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Cherry, ExternalLink, Leaf, MonitorSmartphone, Waypoints } from "lucide-react";
import Image from "next/image";
import { useContext } from "react";
import {
  DEVICE_TREE_SIZES,
  buildDeviceForest,
  deviceKey,
  layoutDeviceForest,
  relatedSessions,
  sessionsOf,
  type DeviceForestLayout,
  type DeviceTree,
  type PlacedDevice,
  type PlacedFruit,
  type PlacedPlace,
  type PlacedSprout,
  type PlacedTwig,
  type SessionLeaf,
} from "@/modules/signins/device-tree";
import { useI18n } from "@/shared/i18n/client";
import type { Translator } from "@/shared/i18n/translate";
import { cn } from "@/shared/ui/cn";
import { ScreenshotUpload } from "../projects/screenshot-upload";
import { PlaceIcon } from "../sign-in-actions";
import { DeviceIcon, ProviderAvatar, approvalLabel, placeLabel, systemLabel } from "../ui";
import type { SceneView } from "./account-mode";
import { FruitActionsContext, LeafMark, depthStyle, placeDetail, placeTitle, type Row, type WireFlowEdge } from "./parts";

/**
 * "By device": one tree per device where something was signed in directly. The device is the trunk, its browser
 * profiles, apps and CLIs are the branches, the providers signed in there are the twigs and each login is a leaf. The
 * sessions a login let in (a CLI with a code, an app with a link, …) hang off it, each naming its device. Pointing at
 * a session lights its account everywhere, with dashed links to the logins made separately.
 */

/** Where a session's wires attach: its row on a twig, or its own node when it hangs off another session. */
type Port = { node: string; out: string; in: string };
export type DeviceScene = {
  trees: DeviceTree<Row>[];
  layout: DeviceForestLayout<Row>;
  /** Every session drawn, grown ones included. */
  shown: Row[];
  ports: Map<number, Port>;
  /** The sessions on or under each node, to light a subtree and dim the rest. */
  under: Map<string, number[]>;
  /** The node each grown session's node hangs off. */
  parentOf: Map<string, string>;
};

type Lighting = {
  /** Sessions lit anywhere (null when nothing is pointed at). */
  lit: Set<number> | null;
  selectedId: number | null;
  onHover: (id: number | null) => void;
  onSelect: (id: number) => void;
};
type DeviceData = { placed: PlacedDevice<Row>; dimmed: boolean; frame: string[]; onFrame: (nodeIds: string[]) => void };
type PlaceData = { placed: PlacedPlace<Row>; dimmed: boolean };
type TwigData = Lighting & { placed: PlacedTwig<Row>; dimmed: boolean; captions: Map<number, string> };
type SproutData = Lighting & { placed: PlacedSprout<Row>; dimmed: boolean };
type FruitData = { placed: PlacedFruit<Row>; dimmed: boolean };
type DeviceFlowNode = Node<DeviceData, "device">;
type PlaceFlowNode = Node<PlaceData, "place">;
type TwigFlowNode = Node<TwigData, "twig">;
type SproutFlowNode = Node<SproutData, "sprout">;
type FruitFlowNode = Node<FruitData, "fruit">;
type AnyFlowNode = DeviceFlowNode | PlaceFlowNode | TwigFlowNode | SproutFlowNode | FruitFlowNode;

/** Whether anything hangs off a session (to show its out port). */
const bears = (leaf: SessionLeaf<Row>) => leaf.grown.length > 0 || (leaf.row.projects?.length ?? 0) > 0;

const leavesOf = (tree: DeviceTree<Row>) => tree.places.flatMap((place) => place.twigs.flatMap((twig) => twig.leaves));
const idsOf = (leaves: SessionLeaf<Row>[]) => sessionsOf(leaves).map((leaf) => leaf.row.id);

function matches(tree: DeviceTree<Row>, needle: string): boolean {
  const words = [tree.device.name];
  for (const place of tree.places) {
    words.push(place.sample.profile?.name ?? place.sample.app ?? "");
    for (const twig of place.twigs) {
      words.push(twig.provider.name);
      for (const { row } of sessionsOf(twig.leaves)) {
        words.push(row.account.identifier, row.account.label ?? "", row.device.name, row.profile?.name ?? row.app ?? "");
        for (const project of row.projects ?? []) words.push(project.name, project.url ?? "");
      }
    }
  }
  return words.join(" ").toLowerCase().includes(needle);
}

export function deviceScene(rows: Row[], options: { staleBefore: string; history: boolean; needle: string; aspect: number }): DeviceScene {
  const forest = buildDeviceForest(rows, { staleBefore: options.staleBefore, history: options.history });
  const trees = options.needle ? forest.filter((tree) => matches(tree, options.needle)) : forest;
  const layout = layoutDeviceForest(trees, { aspect: options.aspect });
  const ports = new Map<number, Port>();
  const under = new Map<string, number[]>();
  for (const node of layout.nodes) {
    if (node.kind === "device") under.set(node.id, idsOf(leavesOf(node.tree)));
    if (node.kind === "place") under.set(node.id, idsOf(node.place.twigs.flatMap((twig) => twig.leaves)));
    if (node.kind === "twig") {
      under.set(node.id, idsOf(node.twig.leaves));
      for (const leaf of node.twig.leaves) ports.set(leaf.row.id, { node: node.id, out: `out-${leaf.row.id}`, in: `in-${leaf.row.id}` });
    }
    if (node.kind === "sprout") {
      under.set(node.id, idsOf([node.leaf]));
      ports.set(node.leaf.row.id, { node: node.id, out: "out", in: "in" });
    }
    // A project lights up with the session working on it.
    if (node.kind === "fruit") under.set(node.id, [node.leaf.row.id]);
  }
  const parentOf = new Map(layout.wires.filter((wire) => wire.kind === "graft").map((wire) => [wire.target, wire.source]));
  const shown = trees.flatMap((tree) => sessionsOf(leavesOf(tree)).map((leaf) => leaf.row));
  return { trees, layout, shown, ports, under, parentOf };
}

export function deviceStats(scene: DeviceScene) {
  return {
    trees: scene.trees.length,
    devices: new Set(scene.shown.map((row) => row.device.id)).size,
    sessions: scene.trees.reduce((sum, tree) => sum + tree.stats.sessions, 0),
    wilting: scene.trees.reduce((sum, tree) => sum + tree.stats.wilting, 0),
  };
}

/**
 * The node ids to frame for a device: its tree; for a device without logins of its own, its sessions where they hang
 * with the nodes they hang off; null when nothing of it is drawn.
 */
export function deviceFrame(scene: DeviceScene, deviceId: number): string[] | null {
  const key = deviceKey(deviceId);
  if (scene.trees.some((tree) => tree.key === key)) return scene.layout.nodes.filter((node) => node.tree.key === key).map((node) => node.id);
  const sprouts = scene.layout.nodes.filter((node) => node.kind === "sprout" && node.leaf.row.device.id === deviceId).map((node) => node.id);
  return sprouts.length > 0 ? [...new Set(sprouts.flatMap((id) => [scene.parentOf.get(id) ?? id, id]))] : null;
}

/** The sessions of a device without logins of its own (they hang in other trees), to light when it is asked for. */
export function deviceSpotlight(scene: DeviceScene, deviceId: number): Set<number> | null {
  if (scene.trees.some((tree) => tree.key === deviceKey(deviceId))) return null;
  const ids = scene.shown.filter((row) => row.device.id === deviceId).map((row) => row.id);
  return ids.length > 0 ? new Set(ids) : null;
}

/**
 * One line under each login on a twig: made directly here (and on how many other devices its account has logins of
 * its own), or let in from a place removed since.
 */
function captionsFor(scene: DeviceScene, all: Row[], t: Translator): Map<number, string> {
  const captions = new Map<number, string>();
  for (const leaf of scene.trees.flatMap(leavesOf)) {
    const { row } = leaf;
    if (row.approvedFromId !== null) {
      captions.set(row.id, t("tree.leafFromRemoved", { how: approvalLabel(row.approvalMethod, t) }));
      continue;
    }
    const family = new Set(idsOf([leaf]));
    const elsewhere = new Set(
      all.filter((other) => other.account.id === row.account.id && other.status === "signed_in" && !family.has(other.id) && other.device.id !== row.device.id).map((other) => other.device.id),
    ).size;
    captions.set(row.id, elsewhere > 0 ? t("tree.leafAlsoOn", { count: elsewhere }) : t("tree.leafDirect"));
  }
  return captions;
}

export function deviceFlow(scene: DeviceScene, view: SceneView, all: Row[], t: Translator): { nodes: AnyFlowNode[]; edges: WireFlowEdge[] } {
  const related = view.pointedId !== null ? relatedSessions(scene.shown, view.pointedId) : null;
  const hovered = view.hoveredNode !== null ? scene.under.get(view.hoveredNode) : undefined;
  const lit = related && related.signIns.size > 0 ? related.signIns : hovered ? new Set(hovered) : view.spotlight;
  const hasLit = (ids: number[] | undefined) => lit !== null && (ids ?? []).some((id) => lit.has(id));
  const captions = captionsFor(scene, all, t);
  const lighting: Lighting = { lit, selectedId: view.selectedId, onHover: view.onHover, onSelect: view.onSelect };
  const frames = new Map<string, string[]>();
  for (const node of scene.layout.nodes) frames.set(node.tree.key, [...(frames.get(node.tree.key) ?? []), node.id]);

  const nodes = scene.layout.nodes.map((placed): AnyFlowNode => {
    // Sizes are fixed by the layout, so the nodes count as measured from the start.
    const base = { id: placed.id, position: { x: placed.x, y: placed.y }, width: placed.width, height: placed.height, measured: { width: placed.width, height: placed.height } };
    const dimmed = lit !== null && !hasLit(scene.under.get(placed.id));
    if (placed.kind === "device") return { ...base, type: "device", data: { placed, dimmed, frame: frames.get(placed.tree.key) ?? [placed.id], onFrame: view.onFrame } };
    if (placed.kind === "place") return { ...base, type: "place", data: { placed, dimmed } };
    if (placed.kind === "twig") return { ...base, type: "twig", data: { ...lighting, placed, dimmed, captions } };
    if (placed.kind === "fruit") return { ...base, type: "fruit", data: { placed, dimmed } };
    return { ...base, type: "sprout", data: { ...lighting, placed, dimmed } };
  });

  const edges: WireFlowEdge[] = scene.layout.wires.map((wire) => {
    const active = wire.kind === "graft" ? lit !== null && lit.has(wire.fromId ?? -1) && lit.has(wire.toId ?? -1) : hasLit(scene.under.get(wire.target));
    return {
      id: wire.id,
      type: "wire",
      source: wire.source,
      sourceHandle: wire.sourceHandle,
      target: wire.target,
      targetHandle: wire.targetHandle,
      data: { kind: wire.kind, method: wire.method, depth: wire.depth, dimmed: lit !== null && !active, active },
    };
  });
  // The pointed session's account, signed in separately elsewhere: dashed links.
  for (const link of related?.links ?? []) {
    const from = scene.ports.get(link.fromId);
    const to = scene.ports.get(link.toId);
    if (!from || !to || from.node === to.node) continue;
    edges.push({
      id: `link:${link.id}`,
      type: "wire",
      source: from.node,
      sourceHandle: from.out,
      target: to.node,
      targetHandle: to.in,
      data: { kind: "cross", method: null, depth: 3, dimmed: false, active: false, live: true },
    });
  }
  return { nodes, edges };
}

/** The trunk: the device, what it is, and how much grows on it. Click to frame its tree. */
function DeviceNode({ data }: NodeProps<DeviceFlowNode>) {
  const { t, format } = useI18n();
  const { tree } = data.placed;
  const frame = () => data.onFrame(data.frame);
  return (
    <div className={cn("tree-node tree-trunk relative size-full rounded-2xl transition-[filter,opacity] duration-200 hover:brightness-125", data.dimmed && "tree-dim")} style={depthStyle(0)}>
      <button type="button" onClick={frame} title={t("tree.frameTree")} className="flex size-full items-center gap-3 rounded-2xl px-4 text-left">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-2 ring-white/10">
          <DeviceIcon kind={tree.device.kind} className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-white">{tree.device.name}</span>
            {tree.stats.reach > 0 ? (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-[#6ee7b7]"
                title={t("tree.deviceReach", { count: format.number(tree.stats.reach) })}
              >
                <MonitorSmartphone className="size-3" />
                {format.number(tree.stats.reach)}
              </span>
            ) : null}
            {tree.stats.wilting > 0 ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-[#fcd34d]" title={t("tree.leaf_wilting")}>
                <Leaf className="size-3" />
                {format.number(tree.stats.wilting)}
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-white/60">{systemLabel(tree.device.system, t)}</span>
          <span className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-white/75">
            <Leaf className="size-3.5 shrink-0 text-[#6ee7b7]" />
            <span className="truncate">{t("tree.deviceStats", { places: format.number(tree.stats.places), sessions: format.number(tree.stats.sessions) })}</span>
          </span>
        </span>
      </button>
      <Handle type="source" position={Position.Right} id="out" isConnectable={false} className="tree-port tree-port-trunk" />
    </div>
  );
}

/** A branch: a browser profile, an app or a command-line tool on the device (or the device itself). */
function PlaceNode({ data }: NodeProps<PlaceFlowNode>) {
  const { t } = useI18n();
  const { sample } = data.placed.place;
  return (
    <div className={cn("tree-node relative flex size-full items-center gap-2.5 rounded-xl border border-line-strong bg-surface px-3 shadow-card", data.dimmed && "tree-dim")} style={depthStyle(1)}>
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} className="tree-port tree-port-trunk" />
      <PlaceIcon row={sample} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-ink">{placeTitle(sample, t)}</span>
        <span className="block truncate text-[11px] text-muted">{placeDetail(sample, t)}</span>
      </span>
      <Handle type="source" position={Position.Right} id="out" isConnectable={false} className="tree-port tree-port-trunk" />
    </div>
  );
}

/** The props a session's button shares, on a twig and on its own node: pointing lights its account, a click opens it. */
function sessionButton(lighting: Lighting, id: number) {
  return {
    type: "button" as const,
    onMouseEnter: () => lighting.onHover(id),
    onMouseLeave: () => lighting.onHover(null),
    onFocus: () => lighting.onHover(id),
    onBlur: () => lighting.onHover(null),
    onClick: () => lighting.onSelect(id),
    "aria-pressed": lighting.selectedId === id,
  };
}

/** A twig: one provider at a place, with a leaf per login made there; what each login let in hangs to the right. */
function TwigNode({ data }: NodeProps<TwigFlowNode>) {
  const { t, format } = useI18n();
  const { twig } = data.placed;
  const active = sessionsOf(twig.leaves).filter((leaf) => leaf.state !== "fallen").length;
  return (
    <div className={cn("tree-node relative flex size-full flex-col rounded-xl border border-line bg-surface shadow-card", data.dimmed && "tree-dim")} style={depthStyle(2)}>
      <header className="relative flex shrink-0 items-center gap-2 border-b border-line px-3" style={{ height: DEVICE_TREE_SIZES.twigHeader }}>
        <Handle type="target" position={Position.Left} id="in" isConnectable={false} className="tree-port" />
        <ProviderAvatar provider={twig.provider} size="sm" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">{twig.provider.name}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-[10px] font-bold text-muted" title={t("tree.sessionsActive", { count: format.number(active) })}>
          <Waypoints className="size-3" />
          {format.number(active)}
        </span>
      </header>
      <ul>
        {twig.leaves.map((leaf) => {
          const id = leaf.row.id;
          const lit = data.lit?.has(id) ?? false;
          return (
            <li key={id} className="relative" style={{ height: DEVICE_TREE_SIZES.sessionHeight }}>
              <button
                {...sessionButton(data, id)}
                className={cn(
                  "group flex size-full items-center gap-2.5 px-3 text-left transition-[background-color,opacity] duration-150 hover:bg-subtle",
                  data.selectedId === id && "bg-accent-soft hover:bg-accent-soft",
                  data.lit !== null && !lit && "opacity-40",
                  leaf.state === "fallen" && "opacity-60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate font-mono text-[12px] font-semibold text-ink", leaf.state === "fallen" && "line-through decoration-faint")}>
                    {leaf.row.account.identifier}
                  </span>
                  <span className="block truncate text-[11px] text-muted">{data.captions.get(id)}</span>
                </span>
                <LeafMark state={leaf.state} />
              </button>
              <Handle type="target" position={Position.Left} id={`in-${id}`} isConnectable={false} className={cn("tree-port", !lit && "tree-port-ghost")} />
              <Handle type="source" position={Position.Right} id={`out-${id}`} isConnectable={false} className={cn("tree-port", !bears(leaf) && !lit && "tree-port-ghost")} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A session let in from the one it hangs off: on which device and where on it. It can let others in in turn. */
function SproutNode({ data }: NodeProps<SproutFlowNode>) {
  const { t } = useI18n();
  const { leaf, level } = data.placed;
  const { row } = leaf;
  const fallen = leaf.state === "fallen";
  const lit = data.lit?.has(row.id) ?? false;
  return (
    <div className={cn("tree-node relative size-full", data.dimmed && "tree-dim")} style={depthStyle(2 + level)}>
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} className="tree-port" />
      <button
        {...sessionButton(data, row.id)}
        title={row.account.identifier}
        className={cn(
          "group flex size-full items-center gap-2.5 rounded-xl border bg-surface px-3 text-left shadow-card transition-[background-color,border-color] duration-150 hover:bg-subtle",
          data.selectedId === row.id ? "border-accent bg-accent-soft hover:bg-accent-soft" : "border-line",
          fallen && "opacity-60",
        )}
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2">
          <DeviceIcon kind={row.device.kind} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[13px] font-bold text-ink", fallen && "line-through decoration-faint")}>{row.device.name}</span>
          <span className="block truncate text-[11px] text-muted">{placeLabel(row, t)}</span>
        </span>
        <LeafMark state={leaf.state} />
      </button>
      <Handle type="source" position={Position.Right} id="out" isConnectable={false} className={cn("tree-port", !bears(leaf) && !lit && "tree-port-ghost")} />
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Fruit: a project the session it hangs off works on, with its screenshot when there is one. */
function FruitNode({ data }: NodeProps<FruitFlowNode>) {
  const { t } = useI18n();
  const actions = useContext(FruitActionsContext);
  const { project, level, tree } = data.placed;
  return (
    <div className={cn("tree-node relative size-full", data.dimmed && "tree-dim")} style={depthStyle(3 + level)}>
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} className="tree-port" />
      <div className="flex size-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        {project.screenshot ? (
          <div className="relative min-h-0 flex-1 border-b border-line bg-sunken">
            <Image src={project.screenshot} alt={t("projects.screenshotOf", { name: project.name })} fill unoptimized draggable={false} sizes="248px" className="object-cover object-top" />
          </div>
        ) : null}
        <div className="flex h-[60px] shrink-0 items-center gap-2.5 px-3">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-bark-soft text-bark">
            <Cherry className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold text-ink" title={project.name}>
              {project.name}
            </span>
            <span className="block truncate font-mono text-[11px] text-muted">{project.url ? hostOf(project.url) : t("projects.noUrl")}</span>
          </span>
          {actions.canWrite && !project.screenshot ? (
            <ScreenshotUpload projectId={project.id} onUploaded={() => actions.onChanged(tree.device.id)} compact className="nodrag" />
          ) : null}
          {project.url ? (
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer noopener"
              title={t("projects.openSite")}
              aria-label={t("projects.openSite")}
              className="nodrag inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink"
            >
              <ExternalLink className="size-4" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const DEVICE_NODE_TYPES = { device: DeviceNode, place: PlaceNode, twig: TwigNode, sprout: SproutNode, fruit: FruitNode };
