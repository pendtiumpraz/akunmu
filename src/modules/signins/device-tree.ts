/**
 * Device trees: one tree per device. The device is the trunk, its places are the branches (browser profiles, apps,
 * command-line tools, the device itself), the providers signed in at a place are the twigs, and every login session
 * is a leaf, noting where it came from. Pointing at a leaf lights the same account's sessions on other devices and the
 * approvals between them (see relatedSessions). Pure functions shared by the screen and the tests.
 */
import { bestPacking, leafState, visibleSignIns, type ForestLayoutOptions, type ForestOptions, type LeafState, type TreeSignIn } from "./tree";
import type { AppKind, ApprovalMethod } from "./types";

/** What the device trees read besides TreeSignIn: the place and the provider. */
export type DeviceTreeSignIn = TreeSignIn & {
  provider: { id: number; name: string };
  profile: { id: number; name: string } | null;
  app: string | null;
  appKind: AppKind | null;
};

export type SessionLeaf<Row extends DeviceTreeSignIn> = { row: Row; state: LeafState };
export type ProviderTwig<Row extends DeviceTreeSignIn> = { key: string; provider: Row["provider"]; leaves: SessionLeaf<Row>[] };
/** A place on the device; `sample` is one of its sign-ins, to name it (profile, app or the device itself). */
export type PlaceBranch<Row extends DeviceTreeSignIn> = { key: string; place: string; sample: Row; twigs: ProviderTwig<Row>[] };
export type DeviceTree<Row extends DeviceTreeSignIn> = {
  key: string;
  device: Row["device"];
  places: PlaceBranch<Row>[];
  stats: { places: number; sessions: number; wilting: number; fallen: number };
};

export function deviceKey(deviceId: number): string {
  return `d:${deviceId}`;
}

/** "p:<profile>", "a:<app>" or "d" (the device itself), as the map's place keys. */
export function placeOf(row: Pick<DeviceTreeSignIn, "profile" | "app">): string {
  if (row.profile) return `p:${row.profile.id}`;
  if (row.app) return `a:${row.app.toLowerCase()}`;
  return "d";
}

const placeRank = (place: string) => (place.startsWith("p:") ? 0 : place.startsWith("a:") ? 1 : 2);
const placeName = (row: Pick<DeviceTreeSignIn, "profile" | "app">) => row.profile?.name ?? row.app ?? "";
const byText = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());

function group<Item, Key>(items: Item[], keyOf: (item: Item) => Key): Map<Key, Item[]> {
  const groups = new Map<Key, Item[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

/** Every device with a visible session, as a tree; devices by name. */
export function buildDeviceForest<Row extends DeviceTreeSignIn>(rows: Row[], options: ForestOptions): DeviceTree<Row>[] {
  const trees: DeviceTree<Row>[] = [];
  for (const deviceRows of group(visibleSignIns(rows, options), (row) => row.device.id).values()) {
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
            leaves: providerRows
              .map((row) => ({ row, state: leafState(row, options.staleBefore) }))
              // Signed out sessions sink to the bottom of their twig.
              .sort((a, b) => Number(a.state === "fallen") - Number(b.state === "fallen") || byText(a.row.account.identifier, b.row.account.identifier)),
          }))
          .sort((a, b) => byText(a.provider.name, b.provider.name)),
      }))
      .sort((a, b) => placeRank(a.place) - placeRank(b.place) || byText(placeName(a.sample), placeName(b.sample)));
    const leaves = places.flatMap((place) => place.twigs.flatMap((twig) => twig.leaves));
    trees.push({
      key: deviceKey(device.id),
      device,
      places,
      stats: {
        places: places.length,
        sessions: leaves.filter((leaf) => leaf.state !== "fallen").length,
        wilting: leaves.filter((leaf) => leaf.state === "wilting").length,
        fallen: leaves.filter((leaf) => leaf.state === "fallen").length,
      },
    });
  }
  return trees.sort((a, b) => byText(a.device.name, b.device.name));
}

// ----- layout -----

/** Sizes the device trees' nodes are drawn with (pixels); the layout and the node components share them. */
export const DEVICE_TREE_SIZES = {
  deviceWidth: 248,
  deviceHeight: 92,
  placeWidth: 232,
  placeHeight: 60,
  twigWidth: 300,
  twigHeader: 42,
  sessionHeight: 46,
  twigPadding: 6,
  columnGap: 96,
  rowGap: 14,
} as const;

export type PlacedDevice<Row extends DeviceTreeSignIn> = { kind: "device"; id: string; x: number; y: number; width: number; height: number; tree: DeviceTree<Row> };
export type PlacedPlace<Row extends DeviceTreeSignIn> = { kind: "place"; id: string; x: number; y: number; width: number; height: number; tree: DeviceTree<Row>; place: PlaceBranch<Row> };
export type PlacedTwig<Row extends DeviceTreeSignIn> = {
  kind: "twig";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tree: DeviceTree<Row>;
  place: PlaceBranch<Row>;
  twig: ProviderTwig<Row>;
};
export type PlacedDeviceNode<Row extends DeviceTreeSignIn> = PlacedDevice<Row> | PlacedPlace<Row> | PlacedTwig<Row>;
/** Trunk wires run from a device to its places, branch wires from a place to its providers. */
export type DeviceWire = { id: string; kind: "trunk" | "branch"; source: string; target: string; depth: number };
export type DeviceForestLayout<Row extends DeviceTreeSignIn> = { nodes: PlacedDeviceNode<Row>[]; wires: DeviceWire[]; width: number; height: number };

export function twigHeight(twig: { leaves: unknown[] }): number {
  return DEVICE_TREE_SIZES.twigHeader + twig.leaves.length * DEVICE_TREE_SIZES.sessionHeight + DEVICE_TREE_SIZES.twigPadding;
}

const PLACE_X = DEVICE_TREE_SIZES.deviceWidth + DEVICE_TREE_SIZES.columnGap;
const TWIG_X = PLACE_X + DEVICE_TREE_SIZES.placeWidth + DEVICE_TREE_SIZES.columnGap;

/** Stacks items of the given heights with the row gap. */
const stack = (heights: number[]) => heights.reduce((sum, height) => sum + height, 0) + Math.max(0, heights.length - 1) * DEVICE_TREE_SIZES.rowGap;

/**
 * One device tree with its trunk at the origin. As in the account trees, every node owns a band as tall as the larger
 * of itself and its children stacked, sits in its middle, and stacks its children inside it: nothing overlaps.
 */
function layoutDeviceTree<Row extends DeviceTreeSignIn>(tree: DeviceTree<Row>): DeviceForestLayout<Row> {
  const nodes: PlacedDeviceNode<Row>[] = [];
  const wires: DeviceWire[] = [];
  const placeBand = (place: PlaceBranch<Row>) => Math.max(DEVICE_TREE_SIZES.placeHeight, stack(place.twigs.map(twigHeight)));
  const height = Math.max(DEVICE_TREE_SIZES.deviceHeight, stack(tree.places.map(placeBand)));
  nodes.push({ kind: "device", id: tree.key, x: 0, y: (height - DEVICE_TREE_SIZES.deviceHeight) / 2, width: DEVICE_TREE_SIZES.deviceWidth, height: DEVICE_TREE_SIZES.deviceHeight, tree });

  let placeTop = (height - stack(tree.places.map(placeBand))) / 2;
  for (const place of tree.places) {
    const band = placeBand(place);
    nodes.push({ kind: "place", id: place.key, x: PLACE_X, y: placeTop + (band - DEVICE_TREE_SIZES.placeHeight) / 2, width: DEVICE_TREE_SIZES.placeWidth, height: DEVICE_TREE_SIZES.placeHeight, tree, place });
    wires.push({ id: `${tree.key}>${place.key}`, kind: "trunk", source: tree.key, target: place.key, depth: 1 });
    let twigTop = placeTop + (band - stack(place.twigs.map(twigHeight))) / 2;
    for (const twig of place.twigs) {
      nodes.push({ kind: "twig", id: twig.key, x: TWIG_X, y: twigTop, width: DEVICE_TREE_SIZES.twigWidth, height: twigHeight(twig), tree, place, twig });
      wires.push({ id: `${place.key}>${twig.key}`, kind: "branch", source: place.key, target: twig.key, depth: 2 });
      twigTop += twigHeight(twig) + DEVICE_TREE_SIZES.rowGap;
    }
    placeTop += band + DEVICE_TREE_SIZES.rowGap;
  }
  return { nodes, wires, width: TWIG_X + DEVICE_TREE_SIZES.twigWidth, height };
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

/** A link drawn between two sessions while one is pointed at: an approval (with how) or "the same account". */
export type SessionLink = { id: string; kind: "graft" | "cross"; fromId: number; toId: number; method: ApprovalMethod | null };

/**
 * What lights up when a session is pointed at: every shown session of the same account (on any device), the approvals
 * between them, and a dashed link from the pointed session to each of its account's sessions no approval connects it to.
 */
export function relatedSessions<Row extends DeviceTreeSignIn>(shown: Row[], signInId: number): { signIns: Set<number>; links: SessionLink[] } {
  const pointed = shown.find((row) => row.id === signInId);
  if (!pointed) return { signIns: new Set(), links: [] };
  const sessions = shown.filter((row) => row.account.id === pointed.account.id);
  const ids = new Set(sessions.map((row) => row.id));
  const links: SessionLink[] = sessions
    .filter((row) => row.approvedFromId !== null && ids.has(row.approvedFromId) && row.approvedFromId !== row.id)
    .map((row) => ({ id: `${row.approvedFromId}>${row.id}`, kind: "graft", fromId: row.approvedFromId as number, toId: row.id, method: row.approvalMethod }));
  const approved = new Set(links.filter((link) => link.fromId === signInId || link.toId === signInId).flatMap((link) => [link.fromId, link.toId]));
  for (const row of sessions) {
    if (row.id === signInId || approved.has(row.id)) continue;
    links.push({ id: `${signInId}~${row.id}`, kind: "cross", fromId: signInId, toId: row.id, method: null });
  }
  return { signIns: ids, links };
}
