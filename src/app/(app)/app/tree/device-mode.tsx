"use client";

import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { Leaf, Waypoints } from "lucide-react";
import {
  DEVICE_TREE_SIZES,
  buildDeviceForest,
  deviceKey,
  layoutDeviceForest,
  relatedSessions,
  type DeviceForestLayout,
  type DeviceTree,
  type PlacedDevice,
  type PlacedPlace,
  type PlacedTwig,
} from "@/modules/signins/device-tree";
import { useI18n } from "@/shared/i18n/client";
import type { Translator } from "@/shared/i18n/translate";
import { cn } from "@/shared/ui/cn";
import { PlaceIcon } from "../sign-in-actions";
import { DeviceIcon, ProviderAvatar, approvalLabel, systemLabel } from "../ui";
import type { SceneView } from "./account-mode";
import { LeafMark, depthStyle, placeDetail, placeTitle, type Row, type WireFlowEdge } from "./parts";

/**
 * "By device": one tree per device. The device is the trunk, its browser profiles, apps and CLIs are the branches,
 * the providers signed in there are the twigs, and every login session is a leaf noting where it came from. Pointing
 * at a leaf lights the same account's sessions on the other devices and draws the links between them.
 */

export type DeviceScene = { trees: DeviceTree<Row>[]; layout: DeviceForestLayout<Row>; shown: Row[]; twigOf: Map<number, string> };

type DeviceData = { placed: PlacedDevice<Row>; dimmed: boolean };
type PlaceData = { placed: PlacedPlace<Row>; dimmed: boolean };
type TwigData = {
  placed: PlacedTwig<Row>;
  dimmed: boolean;
  /** Sessions lit anywhere (null when nothing is pointed at). */
  lit: Set<number> | null;
  captions: Map<number, string>;
  selectedId: number | null;
  onHover: (id: number | null) => void;
  onSelect: (id: number) => void;
};
type DeviceFlowNode = Node<DeviceData, "device">;
type PlaceFlowNode = Node<PlaceData, "place">;
type TwigFlowNode = Node<TwigData, "twig">;

function matches(tree: DeviceTree<Row>, needle: string): boolean {
  const words = [tree.device.name];
  for (const place of tree.places) {
    words.push(place.sample.profile?.name ?? place.sample.app ?? "");
    for (const twig of place.twigs) {
      words.push(twig.provider.name);
      for (const leaf of twig.leaves) words.push(leaf.row.account.identifier, leaf.row.account.label ?? "");
    }
  }
  return words.join(" ").toLowerCase().includes(needle);
}

export function deviceScene(rows: Row[], options: { staleBefore: string; history: boolean; needle: string; aspect: number }): DeviceScene {
  const forest = buildDeviceForest(rows, { staleBefore: options.staleBefore, history: options.history });
  const trees = options.needle ? forest.filter((tree) => matches(tree, options.needle)) : forest;
  const layout = layoutDeviceForest(trees, { aspect: options.aspect });
  const twigOf = new Map<number, string>();
  for (const node of layout.nodes) if (node.kind === "twig") for (const leaf of node.twig.leaves) twigOf.set(leaf.row.id, node.id);
  const shown = trees.flatMap((tree) => tree.places.flatMap((place) => place.twigs.flatMap((twig) => twig.leaves.map((leaf) => leaf.row))));
  return { trees, layout, shown, twigOf };
}

export function deviceStats(scene: DeviceScene) {
  return {
    trees: scene.trees.length,
    sessions: scene.trees.reduce((sum, tree) => sum + tree.stats.sessions, 0),
    wilting: scene.trees.reduce((sum, tree) => sum + tree.stats.wilting, 0),
  };
}

/** The node ids of one device's tree (to frame it), or null when it is not drawn. */
export function deviceFrame(scene: DeviceScene, deviceId: number): string[] | null {
  const tree = scene.trees.find((candidate) => candidate.key === deviceKey(deviceId));
  return tree ? [tree.key, ...tree.places.flatMap((place) => [place.key, ...place.twigs.map((twig) => twig.key)])] : null;
}

/** One line under a session: where it was let in from, else on how many other devices its account is signed in. */
function captionsFor(scene: DeviceScene, all: Row[], t: Translator): Map<number, string> {
  const byId = new Map(all.map((row) => [row.id, row]));
  const devicesOf = new Map<number, Set<number>>();
  for (const row of all) {
    if (row.status !== "signed_in") continue;
    devicesOf.set(row.account.id, (devicesOf.get(row.account.id) ?? new Set()).add(row.device.id));
  }
  const captions = new Map<number, string>();
  for (const row of scene.shown) {
    const origin = row.approvedFromId !== null ? byId.get(row.approvedFromId) : undefined;
    if (origin) {
      captions.set(row.id, t("tree.leafFrom", { device: origin.device.name, how: approvalLabel(row.approvalMethod, t) }));
      continue;
    }
    const elsewhere = [...(devicesOf.get(row.account.id) ?? [])].filter((id) => id !== row.device.id).length;
    captions.set(row.id, elsewhere > 0 ? t("tree.leafAlsoOn", { count: elsewhere }) : t("tree.leafDirect"));
  }
  return captions;
}

/** The sessions under a device, place or twig node (for lighting a subtree under the pointer). */
function sessionsUnder(scene: DeviceScene, nodeId: string): Set<number> | null {
  for (const tree of scene.trees) {
    if (tree.key === nodeId) return new Set(tree.places.flatMap((place) => place.twigs.flatMap((twig) => twig.leaves.map((leaf) => leaf.row.id))));
    for (const place of tree.places) {
      if (place.key === nodeId) return new Set(place.twigs.flatMap((twig) => twig.leaves.map((leaf) => leaf.row.id)));
      const twig = place.twigs.find((candidate) => candidate.key === nodeId);
      if (twig) return new Set(twig.leaves.map((leaf) => leaf.row.id));
    }
  }
  return null;
}

export function deviceFlow(scene: DeviceScene, view: SceneView, all: Row[], t: Translator): { nodes: (DeviceFlowNode | PlaceFlowNode | TwigFlowNode)[]; edges: WireFlowEdge[] } {
  const related = view.pointedId !== null ? relatedSessions(scene.shown, view.pointedId) : null;
  const lit = related && related.signIns.size > 0 ? related.signIns : view.hoveredNode ? sessionsUnder(scene, view.hoveredNode) : null;
  const hasLit = (ids: number[]) => lit !== null && ids.some((id) => lit.has(id));
  const captions = captionsFor(scene, all, t);

  const nodes: (DeviceFlowNode | PlaceFlowNode | TwigFlowNode)[] = scene.layout.nodes.map((placed) => {
    // Sizes are fixed by the layout, so the nodes count as measured from the start.
    const base = { id: placed.id, position: { x: placed.x, y: placed.y }, width: placed.width, height: placed.height, measured: { width: placed.width, height: placed.height } };
    if (placed.kind === "device") {
      const ids = placed.tree.places.flatMap((place) => place.twigs.flatMap((twig) => twig.leaves.map((leaf) => leaf.row.id)));
      return { ...base, type: "device", data: { placed, dimmed: lit !== null && !hasLit(ids) } };
    }
    if (placed.kind === "place") {
      const ids = placed.place.twigs.flatMap((twig) => twig.leaves.map((leaf) => leaf.row.id));
      return { ...base, type: "place", data: { placed, dimmed: lit !== null && !hasLit(ids) } };
    }
    const ids = placed.twig.leaves.map((leaf) => leaf.row.id);
    return {
      ...base,
      type: "twig",
      data: { placed, dimmed: lit !== null && !hasLit(ids), lit, captions, selectedId: view.selectedId, onHover: view.onHover, onSelect: view.onSelect },
    };
  });

  const placeIds = new Map<string, number[]>();
  for (const node of scene.layout.nodes) {
    if (node.kind === "place") placeIds.set(node.id, node.place.twigs.flatMap((twig) => twig.leaves.map((leaf) => leaf.row.id)));
    if (node.kind === "twig") placeIds.set(node.id, node.twig.leaves.map((leaf) => leaf.row.id));
  }
  const edges: WireFlowEdge[] = scene.layout.wires.map((wire) => {
    const active = hasLit(placeIds.get(wire.target) ?? []);
    return {
      id: wire.id,
      type: "wire",
      source: wire.source,
      sourceHandle: "out",
      target: wire.target,
      targetHandle: "in",
      data: { kind: wire.kind, method: null, depth: wire.depth, dimmed: lit !== null && !active, active },
    };
  });
  // The pointed session's account on the other devices: approvals (solid, with how) and same-account links (dashed).
  for (const link of related?.links ?? []) {
    const source = scene.twigOf.get(link.fromId);
    const target = scene.twigOf.get(link.toId);
    if (!source || !target || source === target) continue;
    edges.push({
      id: `link:${link.id}`,
      type: "wire",
      source,
      sourceHandle: `out-${link.fromId}`,
      target,
      targetHandle: `in-${link.toId}`,
      data: { kind: link.kind, method: link.method, depth: 3, dimmed: false, active: link.kind === "graft", live: true },
    });
  }
  return { nodes, edges };
}

/** The trunk: the device, what it is, and how much grows on it. Click to frame its tree. */
function DeviceNode({ data }: NodeProps<DeviceFlowNode>) {
  const { t, format } = useI18n();
  const { fitView } = useReactFlow();
  const { tree } = data.placed;
  const frame = () =>
    void fitView({ nodes: [{ id: tree.key }, ...tree.places.flatMap((place) => [{ id: place.key }, ...place.twigs.map((twig) => ({ id: twig.key }))])], padding: 0.2, maxZoom: 1.1, duration: 450 });
  return (
    <div className={cn("tree-node tree-trunk relative size-full rounded-2xl transition-transform duration-200 hover:-translate-y-0.5", data.dimmed && "tree-dim")} style={depthStyle(0)}>
      <button type="button" onClick={frame} title={t("tree.frameTree")} className="flex size-full items-center gap-3 rounded-2xl px-4 text-left">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-2 ring-white/10">
          <DeviceIcon kind={tree.device.kind} className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold text-white">{tree.device.name}</span>
          <span className="block truncate text-xs text-white/60">{systemLabel(tree.device.system, t)}</span>
          <span className="mt-1.5 flex items-center gap-2 text-[11px] font-medium text-white/75">
            <Leaf className="size-3.5 text-[#6ee7b7]" />
            {t("tree.deviceStats", { places: format.number(tree.stats.places), sessions: format.number(tree.stats.sessions) })}
            {tree.stats.wilting > 0 ? (
              <span className="inline-flex items-center gap-0.5 text-[#fcd34d]">
                <Leaf className="size-3" />
                {format.number(tree.stats.wilting)}
              </span>
            ) : null}
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

/** A twig: one provider at a place, with a leaf per login session (account) noting where it came from. */
function TwigNode({ data }: NodeProps<TwigFlowNode>) {
  const { t, format } = useI18n();
  const { twig } = data.placed;
  const active = twig.leaves.filter((leaf) => leaf.state !== "fallen").length;
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
          const selected = data.selectedId === id;
          const lit = data.lit?.has(id) ?? false;
          return (
            <li key={id} className="relative" style={{ height: DEVICE_TREE_SIZES.sessionHeight }}>
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
              <Handle type="source" position={Position.Right} id={`out-${id}`} isConnectable={false} className={cn("tree-port", !lit && "tree-port-ghost")} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const DEVICE_NODE_TYPES = { device: DeviceNode, place: PlaceNode, twig: TwigNode };
