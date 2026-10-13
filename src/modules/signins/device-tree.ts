/**
 * Device trees: one tree per device where something was signed in directly. The device is the trunk, its places are
 * the branches (browser profiles, apps, command-line tools, the device itself), the providers signed in there are the
 * twigs, and each login made there is a leaf. A login can let more sessions in, on this device or on others (a CLI
 * with a code, an app with a link, a phone with a QR code): those hang off the leaf they came from, each naming its
 * device, as many as there are, and can let others in in turn. A device whose every session came in from elsewhere
 * has no tree of its own: its sessions hang where they grew. Pure functions shared by the screen and the tests.
 */
import { isCliTool } from "../devices/types";
import type { TreeProject } from "../projects/types";
import { bestPacking, leafState, visibleSignIns, type ForestLayoutOptions, type ForestOptions, type LeafState, type TreeSignIn } from "./tree";
import type { AppKind, ApprovalMethod } from "./types";

/** What the device trees read besides TreeSignIn: the place and the provider. */
export type DeviceTreeSignIn = TreeSignIn & {
  provider: { id: number; name: string };
  /** `browser` is the browser, or the tool of a command-line profile (claude-code). */
  profile: { id: number; name: string; browser?: string } | null;
  app: string | null;
  appKind: AppKind | null;
  /** What the session works on: drawn as fruit hanging off it, after the sessions it let in. */
  projects?: TreeProject[];
};

/** A login session and the sessions let in from it (on any device), each with its own. */
export type SessionLeaf<Row extends DeviceTreeSignIn> = { row: Row; state: LeafState; grown: SessionLeaf<Row>[] };
export type ProviderTwig<Row extends DeviceTreeSignIn> = { key: string; provider: Row["provider"]; leaves: SessionLeaf<Row>[] };
/** A place on the device; `sample` is one of its sign-ins, to name it (profile, app or the device itself). */
export type PlaceBranch<Row extends DeviceTreeSignIn> = { key: string; place: string; sample: Row; twigs: ProviderTwig<Row>[] };
export type DeviceTree<Row extends DeviceTreeSignIn> = {
  key: string;
  device: Row["device"];
  places: PlaceBranch<Row>[];
  /** The counts include the sessions grown on other devices; `reach` is how many other devices those are on. */
  stats: { places: number; sessions: number; wilting: number; fallen: number; reach: number };
};

export function deviceKey(deviceId: number): string {
  return `d:${deviceId}`;
}

/** The node of a session that hangs off another one. */
export function sproutKey(signInId: number): string {
  return `s:${signInId}`;
}

/** The node of a project hanging off a session (one per session it hangs off). */
export function fruitKey(signInId: number, projectId: number): string {
  return `f:${signInId}:${projectId}`;
}

/** "p:<profile>", "a:<app>" or "d" (the device itself), as the map's place keys. */
export function placeOf(row: Pick<DeviceTreeSignIn, "profile" | "app">): string {
  if (row.profile) return `p:${row.profile.id}`;
  if (row.app) return `a:${row.app.toLowerCase()}`;
  return "d";
}

/** Some leaves and every session grown from them, depth first. */
export function sessionsOf<Row extends DeviceTreeSignIn>(leaves: SessionLeaf<Row>[]): SessionLeaf<Row>[] {
  return leaves.flatMap((leaf) => [leaf, ...sessionsOf(leaf.grown)]);
}

/** Branches in order: browser profiles, command-line profiles, apps and CLIs on the device, the device itself. */
function branchRank(row: Pick<DeviceTreeSignIn, "profile" | "app">): number {
  if (row.profile) return row.profile.browser && isCliTool(row.profile.browser) ? 1 : 0;
  return row.app ? 2 : 3;
}
const placeName = (row: Pick<DeviceTreeSignIn, "profile" | "app">) => row.profile?.name ?? row.app ?? "";
const byText = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());
const fallenLast = (a: { state: LeafState }, b: { state: LeafState }) => Number(a.state === "fallen") - Number(b.state === "fallen");

/** Leaves on a twig: signed in first, then by account. */
function byAccount<Row extends DeviceTreeSignIn>(a: SessionLeaf<Row>, b: SessionLeaf<Row>): number {
  return fallenLast(a, b) || byText(a.row.account.identifier, b.row.account.identifier);
}

/** Sessions grown from a leaf: signed in first, then by device and place. */
function byDevice<Row extends DeviceTreeSignIn>(a: SessionLeaf<Row>, b: SessionLeaf<Row>): number {
  return fallenLast(a, b) || byText(a.row.device.name, b.row.device.name) || byText(placeName(a.row), placeName(b.row)) || a.row.id - b.row.id;
}

function group<Item, Key>(items: Item[], keyOf: (item: Item) => Key): Map<Key, Item[]> {
  const groups = new Map<Key, Item[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

/** Longest chain of origins followed (guards against loops in the data). */
const MAX_CHAIN = 64;

/**
 * The session each shown session hangs off: its origin, when that is shown too and the origins above it end at a
 * login made directly. Sessions caught in a loop in the data stay leaves of their own.
 */
function hangsOff<Row extends DeviceTreeSignIn>(shown: Row[]): Map<number, number> {
  const byId = new Map(shown.map((row) => [row.id, row]));
  const parents = new Map<number, number>();
  for (const row of shown) {
    const origin = row.approvedFromId !== null ? byId.get(row.approvedFromId) : undefined;
    if (!origin || origin.id === row.id) continue;
    const seen = new Set([row.id]);
    let current: Row | undefined = origin;
    for (let depth = 0; current && !seen.has(current.id) && depth < MAX_CHAIN; depth += 1) {
      seen.add(current.id);
      const next: Row | undefined = current.approvedFromId !== null ? byId.get(current.approvedFromId) : undefined;
      if (!next) {
        parents.set(row.id, origin.id);
        break;
      }
      current = next;
    }
  }
  return parents;
}

/** Every device with a login of its own, as a tree (devices by name), with the sessions grown from those logins. */
export function buildDeviceForest<Row extends DeviceTreeSignIn>(rows: Row[], options: ForestOptions): DeviceTree<Row>[] {
  const shown = visibleSignIns(rows, options);
  const parents = hangsOff(shown);
  const grownFrom = group(
    shown.filter((row) => parents.has(row.id)),
    (row) => parents.get(row.id) as number,
  );
  const leafOf = (row: Row): SessionLeaf<Row> => ({ row, state: leafState(row, options.staleBefore), grown: (grownFrom.get(row.id) ?? []).map(leafOf).sort(byDevice) });

  const trees: DeviceTree<Row>[] = [];
  for (const deviceRows of group(
    shown.filter((row) => !parents.has(row.id)),
    (row) => row.device.id,
  ).values()) {
    const device = deviceRows[0].device;
    const places: PlaceBranch<Row>[] = [...group(deviceRows, placeOf).entries()]
      .map(([place, placeRows]) => ({
        key: `p:${device.id}:${place}`,
        place,
        sample: placeRows[0],
        twigs: [...group(placeRows, (row) => row.provider.id).values()]
          .map((providerRows) => ({
            key: `t:${device.id}:${place}:${providerRows[0].provider.id}`,
            provider: providerRows[0].provider,
            leaves: providerRows.map(leafOf).sort(byAccount),
          }))
          .sort((a, b) => byText(a.provider.name, b.provider.name)),
      }))
      .sort((a, b) => branchRank(a.sample) - branchRank(b.sample) || byText(placeName(a.sample), placeName(b.sample)));
    const sessions = sessionsOf(places.flatMap((place) => place.twigs.flatMap((twig) => twig.leaves)));
    const active = sessions.filter((leaf) => leaf.state !== "fallen");
    trees.push({
      key: deviceKey(device.id),
      device,
      places,
      stats: {
        places: places.length,
        sessions: active.length,
        wilting: sessions.filter((leaf) => leaf.state === "wilting").length,
        fallen: sessions.length - active.length,
        reach: new Set(active.map((leaf) => leaf.row.device.id).filter((id) => id !== device.id)).size,
      },
    });
  }
  return trees.sort((a, b) => byText(a.device.name, b.device.name));
}

// ----- layout -----

/** Sizes the device trees' nodes are drawn with (pixels); the layout and the node components share them. */
export const DEVICE_TREE_SIZES = {
  deviceWidth: 264,
  deviceHeight: 92,
  placeWidth: 232,
  placeHeight: 60,
  twigWidth: 300,
  twigHeader: 42,
  sessionHeight: 46,
  twigPadding: 6,
  sproutWidth: 248,
  sproutHeight: 56,
  /** A project (fruit): with its screenshot, or just its name and address. */
  fruitHeight: 184,
  fruitBareHeight: 62,
  columnGap: 96,
  /** Wider than the other gaps: the wires there carry how each session was let in ("code", "prompt", …). */
  graftGap: 136,
  rowGap: 14,
} as const;

type Placed<Row extends DeviceTreeSignIn> = { id: string; x: number; y: number; width: number; height: number; tree: DeviceTree<Row> };
export type PlacedDevice<Row extends DeviceTreeSignIn> = Placed<Row> & { kind: "device" };
export type PlacedPlace<Row extends DeviceTreeSignIn> = Placed<Row> & { kind: "place"; place: PlaceBranch<Row> };
export type PlacedTwig<Row extends DeviceTreeSignIn> = Placed<Row> & { kind: "twig"; place: PlaceBranch<Row>; twig: ProviderTwig<Row> };
/** A session grown from a leaf (level 1) or from another grown session (one level more each step). */
export type PlacedSprout<Row extends DeviceTreeSignIn> = Placed<Row> & { kind: "sprout"; leaf: SessionLeaf<Row>; level: number };
/** A project a session works on, in the column right of that session (with the sessions it let in, below them). */
export type PlacedFruit<Row extends DeviceTreeSignIn> = Placed<Row> & { kind: "fruit"; leaf: SessionLeaf<Row>; project: TreeProject; level: number };
export type PlacedDeviceNode<Row extends DeviceTreeSignIn> = PlacedDevice<Row> | PlacedPlace<Row> | PlacedTwig<Row> | PlacedSprout<Row> | PlacedFruit<Row>;
/**
 * trunk: from a device to its places; branch: from a place to its providers; graft: from a session to one let in from
 * it (with how), leaving from the leaf's port on its twig or from a grown session; fruit: from a session to a project
 * it works on.
 */
export type DeviceWire = {
  id: string;
  kind: "trunk" | "branch" | "graft" | "fruit";
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  depth: number;
  method: ApprovalMethod | null;
  /** The two sessions a graft joins. */
  fromId: number | null;
  toId: number | null;
};
export type DeviceForestLayout<Row extends DeviceTreeSignIn> = { nodes: PlacedDeviceNode<Row>[]; wires: DeviceWire[]; width: number; height: number };

export function twigHeight(twig: { leaves: unknown[] }): number {
  return DEVICE_TREE_SIZES.twigHeader + twig.leaves.length * DEVICE_TREE_SIZES.sessionHeight + DEVICE_TREE_SIZES.twigPadding;
}

const PLACE_X = DEVICE_TREE_SIZES.deviceWidth + DEVICE_TREE_SIZES.columnGap;
const TWIG_X = PLACE_X + DEVICE_TREE_SIZES.placeWidth + DEVICE_TREE_SIZES.columnGap;

/** The x of the column of sessions grown `level` steps from a leaf (1: right of the twigs), from the trunk. */
export function sproutX(level: number): number {
  return TWIG_X + DEVICE_TREE_SIZES.twigWidth + DEVICE_TREE_SIZES.graftGap + (level - 1) * (DEVICE_TREE_SIZES.sproutWidth + DEVICE_TREE_SIZES.graftGap);
}

/** Stacks items of the given heights with the row gap. */
const stack = (heights: number[]) => heights.reduce((sum, height) => sum + height, 0) + Math.max(0, heights.length - 1) * DEVICE_TREE_SIZES.rowGap;
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

export function fruitHeight(project: TreeProject): number {
  return project.screenshot ? DEVICE_TREE_SIZES.fruitHeight : DEVICE_TREE_SIZES.fruitBareHeight;
}

/** What hangs off a session, in order: the sessions it let in, then the projects it works on. */
const childBands = (leaf: SessionLeaf<DeviceTreeSignIn>): number[] => [...leaf.grown.map(sproutBand), ...(leaf.row.projects ?? []).map(fruitHeight)];

/** The height a grown session needs: the larger of its node and what hangs off it, stacked. */
function sproutBand(leaf: SessionLeaf<DeviceTreeSignIn>): number {
  return Math.max(DEVICE_TREE_SIZES.sproutHeight, stack(childBands(leaf)));
}

/** The middle of a twig's n-th leaf, from the twig's top. */
const leafMiddle = (index: number) => DEVICE_TREE_SIZES.twigHeader + (index + 0.5) * DEVICE_TREE_SIZES.sessionHeight;

/**
 * Where the sessions grown from each leaf of a twig start (from the twig's top), and how tall the twig's band is with
 * them: each group sits beside its leaf when there is room, else right under the group above it.
 */
function twigPlan(twig: ProviderTwig<DeviceTreeSignIn>): { band: number; tops: number[] } {
  let band = twigHeight(twig);
  let free = 0;
  const tops = twig.leaves.map((leaf, index) => {
    const children = childBands(leaf);
    if (children.length === 0) return 0;
    const block = stack(children);
    const top = Math.max(free, leafMiddle(index) - block / 2);
    band = Math.max(band, top + block);
    free = top + block + DEVICE_TREE_SIZES.rowGap;
    return top;
  });
  return { band, tops };
}

type Parts<Row extends DeviceTreeSignIn> = { nodes: PlacedDeviceNode<Row>[]; wires: DeviceWire[] };

/**
 * Places what hangs off `from` in the column of `level`, stacked from `top`: the sessions it let in, each in the middle
 * of its band, then the projects it works on.
 */
function placeGrown<Row extends DeviceTreeSignIn>(tree: DeviceTree<Row>, from: { leaf: SessionLeaf<Row>; node: string; handle: string }, level: number, top: number, parts: Parts<Row>): void {
  let y = top;
  for (const leaf of from.leaf.grown) {
    const band = sproutBand(leaf);
    const id = sproutKey(leaf.row.id);
    parts.nodes.push({ kind: "sprout", id, x: sproutX(level), y: y + (band - DEVICE_TREE_SIZES.sproutHeight) / 2, width: DEVICE_TREE_SIZES.sproutWidth, height: DEVICE_TREE_SIZES.sproutHeight, tree, leaf, level });
    parts.wires.push({
      id: `${from.leaf.row.id}>${leaf.row.id}`,
      kind: "graft",
      source: from.node,
      sourceHandle: from.handle,
      target: id,
      targetHandle: "in",
      depth: 2 + level,
      method: leaf.row.approvalMethod,
      fromId: from.leaf.row.id,
      toId: leaf.row.id,
    });
    placeGrown(tree, { leaf, node: id, handle: "out" }, level + 1, y + (band - stack(childBands(leaf))) / 2, parts);
    y += band + DEVICE_TREE_SIZES.rowGap;
  }
  for (const project of from.leaf.row.projects ?? []) {
    const id = fruitKey(from.leaf.row.id, project.id);
    const height = fruitHeight(project);
    parts.nodes.push({ kind: "fruit", id, x: sproutX(level), y, width: DEVICE_TREE_SIZES.sproutWidth, height, tree, leaf: from.leaf, project, level });
    parts.wires.push({
      id: `${from.leaf.row.id}>f${project.id}`,
      kind: "fruit",
      source: from.node,
      sourceHandle: from.handle,
      target: id,
      targetHandle: "in",
      depth: 2 + level,
      method: null,
      fromId: from.leaf.row.id,
      toId: null,
    });
    y += height + DEVICE_TREE_SIZES.rowGap;
  }
}

/**
 * One device tree with its trunk at the origin. As in the account trees, every node owns a band as tall as the larger
 * of itself and what grows from it, and stacks its children inside it: nothing overlaps. A place faces its providers
 * and the trunk its places, within their bands.
 */
function layoutDeviceTree<Row extends DeviceTreeSignIn>(tree: DeviceTree<Row>): DeviceForestLayout<Row> {
  const parts: Parts<Row> = { nodes: [], wires: [] };
  const plans = new Map(tree.places.flatMap((place) => place.twigs.map((twig) => [twig.key, twigPlan(twig)] as const)));
  const twigBand = (twig: ProviderTwig<Row>) => plans.get(twig.key)?.band ?? twigHeight(twig);
  const placeBand = (place: PlaceBranch<Row>) => Math.max(DEVICE_TREE_SIZES.placeHeight, stack(place.twigs.map(twigBand)));
  const height = Math.max(DEVICE_TREE_SIZES.deviceHeight, stack(tree.places.map(placeBand)));

  const placeMiddles: number[] = [];
  let placeTop = (height - stack(tree.places.map(placeBand))) / 2;
  for (const place of tree.places) {
    const band = placeBand(place);
    let twigTop = placeTop + (band - stack(place.twigs.map(twigBand))) / 2;
    let cardsTop = Infinity;
    let cardsBottom = -Infinity;
    for (const twig of place.twigs) {
      const tops = plans.get(twig.key)?.tops ?? [];
      parts.nodes.push({ kind: "twig", id: twig.key, x: TWIG_X, y: twigTop, width: DEVICE_TREE_SIZES.twigWidth, height: twigHeight(twig), tree, place, twig });
      parts.wires.push({ id: `${place.key}>${twig.key}`, kind: "branch", source: place.key, sourceHandle: "out", target: twig.key, targetHandle: "in", depth: 2, method: null, fromId: null, toId: null });
      twig.leaves.forEach((leaf, index) => placeGrown(tree, { leaf, node: twig.key, handle: `out-${leaf.row.id}` }, 1, twigTop + (tops[index] ?? 0), parts));
      cardsTop = Math.min(cardsTop, twigTop);
      cardsBottom = Math.max(cardsBottom, twigTop + twigHeight(twig));
      twigTop += twigBand(twig) + DEVICE_TREE_SIZES.rowGap;
    }
    const y = clamp((cardsTop + cardsBottom - DEVICE_TREE_SIZES.placeHeight) / 2, placeTop, placeTop + band - DEVICE_TREE_SIZES.placeHeight);
    parts.nodes.push({ kind: "place", id: place.key, x: PLACE_X, y, width: DEVICE_TREE_SIZES.placeWidth, height: DEVICE_TREE_SIZES.placeHeight, tree, place });
    parts.wires.push({ id: `${tree.key}>${place.key}`, kind: "trunk", source: tree.key, sourceHandle: "out", target: place.key, targetHandle: "in", depth: 1, method: null, fromId: null, toId: null });
    placeMiddles.push(y + DEVICE_TREE_SIZES.placeHeight / 2);
    placeTop += band + DEVICE_TREE_SIZES.rowGap;
  }
  const middle = placeMiddles.length > 0 ? (placeMiddles[0] + placeMiddles[placeMiddles.length - 1]) / 2 : height / 2;
  const trunkY = clamp(middle - DEVICE_TREE_SIZES.deviceHeight / 2, 0, height - DEVICE_TREE_SIZES.deviceHeight);
  parts.nodes.unshift({ kind: "device", id: tree.key, x: 0, y: trunkY, width: DEVICE_TREE_SIZES.deviceWidth, height: DEVICE_TREE_SIZES.deviceHeight, tree });
  return { ...parts, width: Math.max(...parts.nodes.map((node) => node.x + node.width)), height };
}

/** Places every device tree and packs the trees into columns that suit the canvas's shape (see bestPacking). */
export function layoutDeviceForest<Row extends DeviceTreeSignIn>(trees: DeviceTree<Row>[], options: ForestLayoutOptions = {}): DeviceForestLayout<Row> {
  const local = trees.map((tree) => layoutDeviceTree(tree));
  if (local.length === 0) return { nodes: [], wires: [], width: 0, height: 0 };
  const best = bestPacking(local, options);
  const nodes: PlacedDeviceNode<Row>[] = [];
  const wires: DeviceWire[] = [];
  local.forEach((tree, index) => {
    const { x, y } = best.origins[index];
    for (const node of tree.nodes) nodes.push({ ...node, x: node.x + x, y: node.y + y });
    wires.push(...tree.wires);
  });
  return { nodes, wires, width: best.width, height: best.height };
}

// ----- lighting up an account across devices -----

/** A dashed link drawn while a session is pointed at, to another login of its account (made separately). */
export type SessionLink = { id: string; fromId: number; toId: number };

/**
 * What lights up when a session is pointed at: every shown session of the same account, on any device. Its own login
 * and the sessions grown from it are wired already; each other login of the account (with what grew from it) gets one
 * dashed link, to that login.
 */
export function relatedSessions<Row extends DeviceTreeSignIn>(shown: Row[], signInId: number): { signIns: Set<number>; links: SessionLink[] } {
  const pointed = shown.find((row) => row.id === signInId);
  if (!pointed) return { signIns: new Set(), links: [] };
  const sessions = shown.filter((row) => row.account.id === pointed.account.id);
  const parents = hangsOff(sessions);
  const loginOf = (id: number): number => {
    let current = id;
    for (let depth = 0; parents.has(current) && depth < MAX_CHAIN; depth += 1) current = parents.get(current) as number;
    return current;
  };
  const logins = new Set(sessions.map((row) => loginOf(row.id)));
  logins.delete(loginOf(signInId));
  const links = [...logins].map((id) => ({ id: `${signInId}~${id}`, fromId: signInId, toId: id }));
  return { signIns: new Set(sessions.map((row) => row.id)), links };
}
