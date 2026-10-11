import { describe, expect, it } from "vitest";
import { DEVICE_TREE_SIZES, buildDeviceForest, layoutDeviceForest, relatedSessions, type DeviceTreeSignIn } from "@/modules/signins/device-tree";
import { visibleSignIns } from "@/modules/signins/tree";

const NOW = "2026-10-11T00:00:00.000Z";
const STALE_BEFORE = "2026-09-11T00:00:00.000Z";
const PROVIDERS: Record<number, string> = { 1: "Google", 2: "Claude", 3: "GitHub" };

type Place = { profile?: [number, string]; app?: string; cli?: boolean };

/** A session of `account` (at `provider`) on `device`, at a browser profile or an app. */
function session(id: number, account: number, provider: number, device: number, place: Place, extra: Partial<DeviceTreeSignIn> = {}): DeviceTreeSignIn {
  return {
    id,
    status: "signed_in",
    approvedFromId: null,
    approvalMethod: null,
    review: false,
    lastVerifiedAt: NOW,
    account: { id: account, identifier: `account${account}@example.com`, label: null },
    provider: { id: provider, name: PROVIDERS[provider] },
    device: { id: device, name: `Device ${device}` },
    profile: place.profile ? { id: place.profile[0], name: place.profile[1] } : null,
    app: place.app ?? null,
    appKind: place.app ? (place.cli ? "cli" : "app") : null,
    ...extra,
  };
}

const work: Place = { profile: [1, "Work"] };
const home: Place = { profile: [2, "Home"] };

describe("device trees", () => {
  it("grows one tree per device: places as branches, providers as twigs, sessions as leaves", () => {
    const rows = [
      session(1, 10, 1, 100, work),
      session(2, 11, 1, 100, work),
      session(3, 20, 2, 100, work),
      session(4, 10, 1, 100, home),
      session(5, 20, 2, 200, { app: "Claude Code", cli: true }, { approvedFromId: 3, approvalMethod: "code" }),
      session(6, 20, 2, 300, { app: "Claude Code", cli: true }, { approvedFromId: 3, approvalMethod: "code" }),
      session(7, 10, 1, 100, { app: "Gmail" }),
    ];
    const forest = buildDeviceForest(rows, { staleBefore: STALE_BEFORE, history: false });
    expect(forest.map((tree) => tree.device.id)).toEqual([100, 200, 300]);
    const [pc] = forest;
    // Browser profiles first (by name), then apps.
    expect(pc.places.map((place) => place.place)).toEqual(["p:2", "p:1", "a:gmail"]);
    const workPlace = pc.places.find((place) => place.place === "p:1")!;
    expect(workPlace.twigs.map((twig) => [twig.provider.name, twig.leaves.map((leaf) => leaf.row.id)])).toEqual([
      ["Claude", [3]],
      ["Google", [1, 2]],
    ]);
    expect(pc.stats).toEqual({ places: 3, sessions: 5, wilting: 0, fallen: 0 });
  });

  it("keeps a signed out session that others were let in from, and shows the rest only with history", () => {
    const rows = [session(1, 20, 2, 100, work, { status: "signed_out" }), session(2, 20, 2, 200, { app: "Claude Code", cli: true }, { approvedFromId: 1 }), session(3, 10, 1, 300, home, { status: "signed_out" })];
    const trail = buildDeviceForest(rows, { staleBefore: STALE_BEFORE, history: false });
    expect(trail.map((tree) => tree.device.id)).toEqual([100, 200]);
    expect(trail[0].places[0].twigs[0].leaves[0].state).toBe("fallen");
    expect(buildDeviceForest(rows, { staleBefore: STALE_BEFORE, history: true }).map((tree) => tree.device.id)).toEqual([100, 200, 300]);
  });

  it("lights the account's sessions on every device, with its approvals and dashed links to the others", () => {
    const rows = [
      session(1, 20, 2, 100, work),
      session(2, 20, 2, 200, { app: "Claude Code", cli: true }, { approvedFromId: 1, approvalMethod: "code" }),
      session(3, 20, 2, 300, { app: "Claude Code", cli: true }, { approvedFromId: 1, approvalMethod: "code" }),
      session(4, 20, 2, 400, home),
      session(5, 10, 1, 100, work),
    ];
    const shown = visibleSignIns(rows, { history: false });
    const lit = relatedSessions(shown, 2);
    expect([...lit.signIns].sort()).toEqual([1, 2, 3, 4]);
    expect(lit.links.filter((link) => link.kind === "graft").map((link) => link.id).sort()).toEqual(["1>2", "1>3"]);
    // Session 2 is linked to 1 by its approval; 3 and 4 get dashed "same account" links.
    expect(lit.links.filter((link) => link.kind === "cross").map((link) => link.toId).sort()).toEqual([3, 4]);
    expect(relatedSessions(shown, 99)).toEqual({ signIns: new Set(), links: [] });
  });
});

describe("device tree layout", () => {
  function randomRows(seed: number) {
    let state = seed;
    const next = () => {
      state = (state * 1103515245 + 12345) % 2 ** 31;
      return state / 2 ** 31;
    };
    const rows: DeviceTreeSignIn[] = [];
    for (let id = 1; id <= 60; id += 1) {
      const place: Place = next() < 0.6 ? { profile: [1 + Math.floor(next() * 4), `Profile ${id % 4}`] } : { app: `App ${Math.floor(next() * 3)}`, cli: next() < 0.5 };
      rows.push(session(id, 1 + Math.floor(next() * 12), 1 + Math.floor(next() * 3), 1 + Math.floor(next() * 6), place, { status: next() < 0.15 ? "signed_out" : "signed_in" }));
    }
    return rows;
  }

  it("never lets two nodes overlap and keeps every kind of node in its column", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const { nodes, wires } = layoutDeviceForest(buildDeviceForest(randomRows(seed), { staleBefore: STALE_BEFORE, history: true }), { aspect: [0.6, 1.6, 3][seed % 3] });
      for (let a = 0; a < nodes.length; a += 1) {
        for (let b = a + 1; b < nodes.length; b += 1) {
          const [p, q] = [nodes[a], nodes[b]];
          const apart = p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y;
          expect(apart, `seed ${seed}: ${p.id} overlaps ${q.id}`).toBe(true);
        }
      }
      const byId = new Map(nodes.map((node) => [node.id, node]));
      for (const node of nodes) {
        const trunk = byId.get(node.tree.key)!;
        const column = { device: 0, place: DEVICE_TREE_SIZES.deviceWidth + DEVICE_TREE_SIZES.columnGap, twig: DEVICE_TREE_SIZES.deviceWidth + DEVICE_TREE_SIZES.placeWidth + 2 * DEVICE_TREE_SIZES.columnGap }[node.kind];
        expect(node.x - trunk.x).toBe(column);
      }
      for (const wire of wires) expect(byId.has(wire.source) && byId.has(wire.target), wire.id).toBe(true);
    }
  });
});
