/**
 * Account trees: where each account grew, device by device. The account is the trunk. A device where it was signed
 * in directly is a root; a device it reached through a code, link, QR code or prompt approved on another device is a
 * branch of that device; the places on a device (browser profiles, apps, command-line tools) are its leaves.
 * Pure functions shared by the screen and the tests (no database or React imports).
 */
import type { ApprovalMethod } from "./types";

/** The fields of a sign-in the trees read (a sign-in row as the browser receives it has them all). */
export type TreeSignIn = {
  id: number;
  status: "signed_in" | "signed_out";
  approvedFromId: number | null;
  approvalMethod: ApprovalMethod | null;
  review: boolean;
  lastVerifiedAt: string;
  account: { id: number; identifier: string; label: string | null };
  provider: { name: string };
  device: { id: number; name: string };
};

/** Fresh (confirmed lately), wilting (to check) or fallen (signed out, kept as history). */
export type LeafState = "fresh" | "wilting" | "fallen";

export type TreeLeaf<Row extends TreeSignIn> = { row: Row; state: LeafState };

export type TreeBranch<Row extends TreeSignIn> = {
  key: string;
  device: Row["device"];
  leaves: TreeLeaf<Row>[];
  /** The branch this device grew from; null for a root. */
  parentKey: string | null;
  /** The approval that brought the account to this device: from a leaf of the parent branch to a leaf of this one. */
  via: { fromId: number; toId: number; method: ApprovalMethod | null } | null;
  /** 1 for a root, one more per branch below. */
  depth: number;
};

export type AccountTree<Row extends TreeSignIn> = {
  key: string;
  account: Row["account"];
  provider: Row["provider"];
  /** Depth first: each root (in the order the account reached it) followed by the branches grown from it. */
  branches: TreeBranch<Row>[];
  stats: { devices: number; leaves: number; wilting: number; fallen: number };
};

export type ForestOptions = {
  /** Sign-ins confirmed before this instant are wilting. */
  staleBefore: string;
  /** Show every signed out place too; without it only those an active place grew from stay, as the trail. */
  history: boolean;
};

/** Longest chain of origins followed (guards against loops in the data). */
const MAX_DEPTH = 64;

export function leafState(row: Pick<TreeSignIn, "status" | "review" | "lastVerifiedAt">, staleBefore: string): LeafState {
  if (row.status !== "signed_in") return "fallen";
  return row.review || row.lastVerifiedAt < staleBefore ? "wilting" : "fresh";
}

export function accountKey(accountId: number): string {
  return `a:${accountId}`;
}

export function branchKey(accountId: number, deviceId: number): string {
  return `b:${accountId}:${deviceId}`;
}

/**
 * The sign-ins a forest shows: the active ones, the places they grew from (even when signed out since, as the trail)
 * and, with history, every signed out one.
 */
export function visibleSignIns<Row extends Pick<TreeSignIn, "id" | "status" | "approvedFromId">>(rows: Row[], options: Pick<ForestOptions, "history">): Row[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const visible = new Set(rows.filter((row) => row.status === "signed_in" || options.history).map((row) => row.id));
  if (!options.history) {
    for (const row of rows) {
      if (row.status !== "signed_in") continue;
      let origin = row.approvedFromId !== null ? byId.get(row.approvedFromId) : undefined;
      for (let depth = 0; origin && !visible.has(origin.id) && depth < MAX_DEPTH; depth += 1) {
        visible.add(origin.id);
        origin = origin.approvedFromId !== null ? byId.get(origin.approvedFromId) : undefined;
      }
    }
  }
  return rows.filter((row) => visible.has(row.id));
}

function buildTree<Row extends TreeSignIn>(rows: Row[], options: ForestOptions): AccountTree<Row> | null {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const visible = new Set(rows.filter((row) => row.status === "signed_in" || options.history).map((row) => row.id));
  if (!options.history) {
    // Keep the trail: places an active sign-in grew from stay visible even after they were signed out.
    for (const row of rows) {
      if (row.status !== "signed_in") continue;
      let origin = row.approvedFromId !== null ? byId.get(row.approvedFromId) : undefined;
      for (let depth = 0; origin && !visible.has(origin.id) && depth < MAX_DEPTH; depth += 1) {
        visible.add(origin.id);
        origin = origin.approvedFromId !== null ? byId.get(origin.approvedFromId) : undefined;
      }
    }
  }
  const shown = rows.filter((row) => visible.has(row.id)).sort((a, b) => a.id - b.id);
  if (shown.length === 0) return null;
  const { account, provider } = shown[0];

  // One branch per device, in the order the account reached the devices.
  const byDevice = new Map<number, TreeBranch<Row>>();
  for (const row of shown) {
    let branch = byDevice.get(row.device.id);
    if (!branch) {
      branch = { key: branchKey(account.id, row.device.id), device: row.device, leaves: [], parentKey: null, via: null, depth: 1 };
      byDevice.set(row.device.id, branch);
    }
    branch.leaves.push({ row, state: leafState(row, options.staleBefore) });
  }

  // A device grows from the device of the first approval that brought the account there, unless that closes a loop.
  const parentOf = new Map<number, number>();
  const leadsTo = (from: number, to: number) => {
    let current: number | undefined = from;
    for (let depth = 0; current !== undefined && depth < MAX_DEPTH; depth += 1) {
      if (current === to) return true;
      current = parentOf.get(current);
    }
    return false;
  };
  for (const branch of byDevice.values()) {
    for (const leaf of branch.leaves) {
      const origin = leaf.row.approvedFromId !== null ? byId.get(leaf.row.approvedFromId) : undefined;
      if (!origin || !visible.has(origin.id) || origin.device.id === branch.device.id) continue;
      if (leadsTo(origin.device.id, branch.device.id)) continue;
      parentOf.set(branch.device.id, origin.device.id);
      branch.parentKey = branchKey(account.id, origin.device.id);
      branch.via = { fromId: origin.id, toId: leaf.row.id, method: leaf.row.approvalMethod };
      break;
    }
  }

  const children = new Map<number | null, TreeBranch<Row>[]>();
  for (const branch of byDevice.values()) {
    const parent = parentOf.get(branch.device.id) ?? null;
    children.set(parent, [...(children.get(parent) ?? []), branch]);
  }
  const ordered: TreeBranch<Row>[] = [];
  const visit = (branch: TreeBranch<Row>, depth: number) => {
    branch.depth = depth;
    ordered.push(branch);
    for (const child of children.get(branch.device.id) ?? []) visit(child, depth + 1);
  };
  for (const root of children.get(null) ?? []) visit(root, 1);

  for (const branch of ordered) {
    // Signed out places sink to the bottom of their device.
    branch.leaves.sort((a, b) => Number(a.state === "fallen") - Number(b.state === "fallen") || a.row.id - b.row.id);
  }
  const leaves = ordered.flatMap((branch) => branch.leaves);
  return {
    key: accountKey(account.id),
    account,
    provider,
    branches: ordered,
    stats: {
      devices: ordered.length,
      leaves: leaves.filter((leaf) => leaf.state !== "fallen").length,
      wilting: leaves.filter((leaf) => leaf.state === "wilting").length,
      fallen: leaves.filter((leaf) => leaf.state === "fallen").length,
    },
  };
}

/** Every account with a visible place, as a tree; accounts by provider, then identifier. */
export function buildForest<Row extends TreeSignIn>(rows: Row[], options: ForestOptions): AccountTree<Row>[] {
  const byAccount = new Map<number, Row[]>();
  for (const row of rows) byAccount.set(row.account.id, [...(byAccount.get(row.account.id) ?? []), row]);
  const trees: AccountTree<Row>[] = [];
  for (const accountRows of byAccount.values()) {
    const tree = buildTree(accountRows, options);
    if (tree) trees.push(tree);
  }
  return trees.sort(
    (a, b) => a.provider.name.localeCompare(b.provider.name) || a.account.identifier.toLowerCase().localeCompare(b.account.identifier.toLowerCase()),
  );
}

// ----- layout -----

/** Sizes the nodes are drawn with (pixels); the layout and the node components share them. */
export const TREE_SIZES = {
  accountWidth: 248,
  accountHeight: 92,
  branchWidth: 272,
  headerHeight: 52,
  leafHeight: 44,
  branchPadding: 8,
  columnGap: 112,
  rowGap: 20,
  treeGap: 64,
  /** Between columns of trees when the forest is packed into several columns. */
  forestGap: 136,
} as const;

export type PlacedAccount<Row extends TreeSignIn> = { kind: "account"; id: string; x: number; y: number; width: number; height: number; depth: 0; tree: AccountTree<Row> };
export type PlacedBranch<Row extends TreeSignIn> = {
  kind: "branch";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  tree: AccountTree<Row>;
  branch: TreeBranch<Row>;
  /** Which ports the node shows: the header input (from the trunk), and per leaf an input and an output. */
  ports: { header: boolean; leafIn: number[]; leafOut: number[] };
};
export type PlacedNode<Row extends TreeSignIn> = PlacedAccount<Row> | PlacedBranch<Row>;

/**
 * A wire: trunk (account to a root device), graft (an approval from the device it grew from) or cross (an
 * approval from another device of the tree, drawn but not part of the tree's shape).
 */
export type PlacedWire = {
  id: string;
  kind: "trunk" | "graft" | "cross";
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  method: ApprovalMethod | null;
  /** The sign-ins at both ends of an approval (null on trunk wires). */
  fromId: number | null;
  toId: number | null;
  depth: number;
};

export type ForestLayout<Row extends TreeSignIn> = { nodes: PlacedNode<Row>[]; wires: PlacedWire[]; width: number; height: number };

export function branchHeight(branch: { leaves: unknown[] }): number {
  return TREE_SIZES.headerHeight + branch.leaves.length * TREE_SIZES.leafHeight + TREE_SIZES.branchPadding;
}

/** Left edge of a column: the trunk at depth 0, then one column of devices per depth. */
export function columnX(depth: number): number {
  if (depth === 0) return 0;
  return TREE_SIZES.accountWidth + TREE_SIZES.columnGap + (depth - 1) * (TREE_SIZES.branchWidth + TREE_SIZES.columnGap);
}

/**
 * Places one tree with its trunk at the origin. Each subtree owns a horizontal band as tall as the larger of its own
 * node and its children stacked with a gap; a node sits in the middle of its band and its children's bands are stacked
 * inside it. Bands of different subtrees never overlap, so no two nodes collide and no wire crosses another subtree.
 */
function layoutTree<Row extends TreeSignIn>(tree: AccountTree<Row>): ForestLayout<Row> {
  const nodes: PlacedNode<Row>[] = [];
  const wires: PlacedWire[] = [];
  let width: number = TREE_SIZES.accountWidth;
  const children = new Map<string | null, TreeBranch<Row>[]>();
  for (const branch of tree.branches) children.set(branch.parentKey, [...(children.get(branch.parentKey) ?? []), branch]);
  const bands = new Map<string, number>();
  const stackHeight = (list: TreeBranch<Row>[]): number =>
    list.reduce((sum, branch) => sum + band(branch), 0) + Math.max(0, list.length - 1) * TREE_SIZES.rowGap;
  const band = (branch: TreeBranch<Row>): number => {
    const known = bands.get(branch.key);
    if (known !== undefined) return known;
    const value = Math.max(branchHeight(branch), stackHeight(children.get(branch.key) ?? []));
    bands.set(branch.key, value);
    return value;
  };

  const placed = new Map<string, PlacedBranch<Row>>();
  const place = (branch: TreeBranch<Row>, bandTop: number) => {
    const own = branchHeight(branch);
    const height = band(branch);
    const node: PlacedBranch<Row> = {
      kind: "branch",
      id: branch.key,
      x: columnX(branch.depth),
      y: bandTop + (height - own) / 2,
      width: TREE_SIZES.branchWidth,
      height: own,
      depth: branch.depth,
      tree,
      branch,
      ports: { header: branch.parentKey === null, leafIn: [], leafOut: [] },
    };
    placed.set(branch.key, node);
    nodes.push(node);
    width = Math.max(width, node.x + node.width);
    const kids = children.get(branch.key) ?? [];
    let cursor = bandTop + (height - stackHeight(kids)) / 2;
    for (const kid of kids) {
      place(kid, cursor);
      cursor += band(kid) + TREE_SIZES.rowGap;
    }
  };

  const roots = children.get(null) ?? [];
  const height = Math.max(TREE_SIZES.accountHeight, stackHeight(roots));
  nodes.push({
    kind: "account",
    id: tree.key,
    x: 0,
    y: (height - TREE_SIZES.accountHeight) / 2,
    width: TREE_SIZES.accountWidth,
    height: TREE_SIZES.accountHeight,
    depth: 0,
    tree,
  });
  let cursor = (height - stackHeight(roots)) / 2;
  for (const root of roots) {
    place(root, cursor);
    cursor += band(root) + TREE_SIZES.rowGap;
    wires.push({ id: `${tree.key}>${root.key}`, kind: "trunk", source: tree.key, sourceHandle: "trunk", target: root.key, targetHandle: "in", method: null, fromId: null, toId: null, depth: 1 });
  }

  // Approvals between devices: grafts along the tree, cross wires otherwise.
  const branchOfLeaf = new Map<number, PlacedBranch<Row>>();
  for (const node of placed.values()) for (const leaf of node.branch.leaves) branchOfLeaf.set(leaf.row.id, node);
  for (const target of placed.values()) {
    for (const leaf of target.branch.leaves) {
      const fromId = leaf.row.approvedFromId;
      const source = fromId !== null ? branchOfLeaf.get(fromId) : undefined;
      if (fromId === null || !source || source === target) continue;
      source.ports.leafOut.push(fromId);
      target.ports.leafIn.push(leaf.row.id);
      wires.push({
        id: `${fromId}>${leaf.row.id}`,
        kind: target.branch.parentKey === source.id ? "graft" : "cross",
        source: source.id,
        sourceHandle: `out-${fromId}`,
        target: target.id,
        targetHandle: `in-${leaf.row.id}`,
        method: leaf.row.approvalMethod,
        fromId,
        toId: leaf.row.id,
        depth: target.depth,
      });
    }
  }
  return { nodes, wires, width, height };
}

/** The trees in `count` columns, each tree going to the shortest column so far (the leftmost on a tie). */
export function packColumns(sizes: { width: number; height: number }[], count: number) {
  const columns = Array.from({ length: count }, () => ({ height: 0, width: 0, members: [] as number[] }));
  sizes.forEach((size, index) => {
    const column = columns.reduce((lowest, candidate) => (candidate.height < lowest.height ? candidate : lowest));
    column.height += (column.members.length > 0 ? TREE_SIZES.treeGap : 0) + size.height;
    column.width = Math.max(column.width, size.width);
    column.members.push(index);
  });
  const origins: { x: number; y: number }[] = [];
  let x = 0;
  for (const column of columns.filter((candidate) => candidate.members.length > 0)) {
    let y = 0;
    for (const index of column.members) {
      origins[index] = { x, y };
      y += sizes[index].height + TREE_SIZES.treeGap;
    }
    x += column.width + TREE_SIZES.forestGap;
  }
  return { origins, width: Math.max(0, x - TREE_SIZES.forestGap), height: Math.max(0, ...columns.map((column) => column.height)) };
}

export type ForestLayoutOptions = {
  /** Width / height of the space the forest is shown in; the trees are packed in as many columns as come closest. */
  aspect?: number;
  maxColumns?: number;
};

/**
 * Places every tree (see layoutTree) and packs the trees into columns, as many as bring the forest's shape closest to
 * the space it is shown in. Trees never share space: columns sit side by side and trees in a column one under another.
 */
/** The packing into columns (1 to `maxColumns`) whose overall shape comes closest to `aspect`. */
export function bestPacking(sizes: { width: number; height: number }[], options: ForestLayoutOptions = {}) {
  const aspect = options.aspect ?? 1.6;
  const most = Math.max(1, Math.min(options.maxColumns ?? 6, sizes.length));
  let best = packColumns(sizes, 1);
  for (let count = 2; count <= most; count += 1) {
    const candidate = packColumns(sizes, count);
    if (Math.abs(Math.log(candidate.width / candidate.height / aspect)) < Math.abs(Math.log(best.width / best.height / aspect))) best = candidate;
  }
  return best;
}

export function layoutForest<Row extends TreeSignIn>(trees: AccountTree<Row>[], options: ForestLayoutOptions = {}): ForestLayout<Row> {
  const local = trees.map((tree) => layoutTree(tree));
  if (local.length === 0) return { nodes: [], wires: [], width: 0, height: 0 };
  const best = bestPacking(local, options);
  const nodes: PlacedNode<Row>[] = [];
  const wires: PlacedWire[] = [];
  local.forEach((tree, index) => {
    const { x, y } = best.origins[index];
    for (const node of tree.nodes) nodes.push({ ...node, x: node.x + x, y: node.y + y });
    wires.push(...tree.wires);
  });
  return { nodes, wires, width: best.width, height: best.height };
}

/**
 * What lights up when a sign-in is pointed at: the places it grew from and those grown from it (following
 * approvals), their devices, and the trunk.
 */
export function relatedToSignIn<Row extends TreeSignIn>(tree: AccountTree<Row>, signInId: number): { signIns: Set<number>; branches: Set<string> } {
  const leaves = tree.branches.flatMap((branch) => branch.leaves.map((leaf) => ({ leaf, branch })));
  const byId = new Map(leaves.map((entry) => [entry.leaf.row.id, entry]));
  const signIns = new Set<number>([signInId]);
  let origin = byId.get(signInId)?.leaf.row.approvedFromId ?? null;
  for (let depth = 0; origin !== null && byId.has(origin) && !signIns.has(origin) && depth < MAX_DEPTH; depth += 1) {
    signIns.add(origin);
    origin = byId.get(origin)?.leaf.row.approvedFromId ?? null;
  }
  // Descendants: keep adding sign-ins whose origin is already in the set of grown ones.
  const grown = new Set<number>([signInId]);
  for (let changed = true, rounds = 0; changed && rounds < MAX_DEPTH; rounds += 1) {
    changed = false;
    for (const { leaf } of leaves) {
      const from = leaf.row.approvedFromId;
      if (from !== null && grown.has(from) && !grown.has(leaf.row.id)) {
        grown.add(leaf.row.id);
        signIns.add(leaf.row.id);
        changed = true;
      }
    }
  }
  const branches = new Set<string>();
  for (const id of signIns) {
    const entry = byId.get(id);
    if (entry) branches.add(entry.branch.key);
  }
  return { signIns, branches };
}
