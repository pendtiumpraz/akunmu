"use client";

import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { GitBranch, Leaf, Sprout, TreeDeciduous } from "lucide-react";
import {
  accountKey,
  buildForest,
  layoutForest,
  relatedToSignIn,
  type AccountTree,
  type ForestLayout,
  type PlacedAccount,
  type PlacedBranch,
} from "@/modules/signins/tree";
import { useI18n } from "@/shared/i18n/client";
import { cn } from "@/shared/ui/cn";
import { PlaceIcon } from "../sign-in-actions";
import { DeviceIcon, ProviderAvatar, systemLabel } from "../ui";
import { LeafMark, depthStyle, placeDetail, placeTitle, type Row, type WireFlowEdge } from "./parts";

/**
 * "By account": each account is a trunk, the devices it was signed in on directly are roots, the devices it reached
 * through an approval are branches, and its sessions there are leaves. Pointing at a leaf lights the sessions it grew
 * from and grew into.
 */

type Lit = { signIns: Set<number>; branches: Set<string>; tree: string } | null;
export type AccountScene = { trees: AccountTree<Row>[]; layout: ForestLayout<Row> };
export type SceneView = { pointedId: number | null; hoveredNode: string | null; selectedId: number | null; onHover: (id: number | null) => void; onSelect: (id: number) => void };

type TrunkData = { placed: PlacedAccount<Row>; dimmed: boolean };
type BranchData = { placed: PlacedBranch<Row>; dimmed: boolean; lit: Set<number> | null; selectedId: number | null; onHover: (id: number | null) => void; onSelect: (id: number) => void };
type TrunkFlowNode = Node<TrunkData, "account">;
type BranchFlowNode = Node<BranchData, "branch">;

function matches(tree: AccountTree<Row>, needle: string): boolean {
  const text = [tree.account.identifier, tree.account.label ?? "", tree.provider.name, ...tree.branches.map((branch) => branch.device.name)].join(" ").toLowerCase();
  return text.includes(needle);
}

export function accountScene(rows: Row[], options: { staleBefore: string; history: boolean; needle: string; aspect: number }): AccountScene {
  const forest = buildForest(rows, { staleBefore: options.staleBefore, history: options.history });
  const trees = options.needle ? forest.filter((tree) => matches(tree, options.needle)) : forest;
  return { trees, layout: layoutForest(trees, { aspect: options.aspect }) };
}

export function accountStats(scene: AccountScene) {
  return {
    trees: scene.trees.length,
    sessions: scene.trees.reduce((sum, tree) => sum + tree.stats.leaves, 0),
    devices: new Set(scene.trees.flatMap((tree) => tree.branches.map((branch) => branch.device.id))).size,
    wilting: scene.trees.reduce((sum, tree) => sum + tree.stats.wilting, 0),
  };
}

/** The node ids of one account's tree (to frame it), or null when it is not drawn. */
export function accountFrame(scene: AccountScene, accountId: number): string[] | null {
  const tree = scene.trees.find((candidate) => candidate.key === accountKey(accountId));
  return tree ? [tree.key, ...tree.branches.map((branch) => branch.key)] : null;
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

export function accountFlow(scene: AccountScene, view: SceneView): { nodes: (TrunkFlowNode | BranchFlowNode)[]; edges: WireFlowEdge[] } {
  const lit = litFor(scene.trees, view.pointedId, view.hoveredNode);
  const nodes: (TrunkFlowNode | BranchFlowNode)[] = scene.layout.nodes.map((placed) =>
    placed.kind === "account"
      ? { id: placed.id, type: "account", position: { x: placed.x, y: placed.y }, width: placed.width, height: placed.height, measured: { width: placed.width, height: placed.height }, data: { placed, dimmed: lit !== null && lit.tree !== placed.id } }
      : {
          id: placed.id,
          type: "branch",
          position: { x: placed.x, y: placed.y },
          width: placed.width,
          height: placed.height,
          measured: { width: placed.width, height: placed.height },
          data: {
            placed,
            dimmed: lit !== null && !lit.branches.has(placed.id),
            lit: lit && lit.tree === placed.tree.key ? lit.signIns : null,
            selectedId: view.selectedId,
            onHover: view.onHover,
            onSelect: view.onSelect,
          },
        },
  );
  const edges: WireFlowEdge[] = scene.layout.wires.map((wire) => {
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
      data: { kind: wire.kind, method: wire.method, depth: wire.depth, dimmed: lit !== null && !active, active },
    };
  });
  return { nodes, edges };
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

/** A device on an account's tree: a root (signed in directly) or a branch (reached from another device), with its leaves. */
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
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", root ? "bg-bark-soft text-bark" : "bg-accent-soft text-accent")}>
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
                  <span className={cn("block truncate text-[13px] font-semibold text-ink", leaf.state === "fallen" && "line-through decoration-faint")}>{placeTitle(leaf.row, t)}</span>
                  <span className="block truncate text-[11px] text-muted">{placeDetail(leaf.row, t)}</span>
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

export const ACCOUNT_NODE_TYPES = { account: TrunkNode, branch: BranchNode };
