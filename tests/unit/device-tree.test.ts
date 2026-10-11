import { describe, expect, it } from "vitest";
import {
  DEVICE_TREE_SIZES,
  buildDeviceForest,
  layoutDeviceForest,
  relatedSessions,
  sessionsOf,
  sproutX,
  type DeviceTree,
  type DeviceTreeSignIn,
} from "@/modules/signins/device-tree";
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
const claudeCode: Place = { app: "Claude Code", cli: true };
const options = { staleBefore: STALE_BEFORE, history: false };

/** Every session a forest draws (logins and what grew from them), by id. */
const drawn = (forest: DeviceTree<DeviceTreeSignIn>[]) =>
  sessionsOf(forest.flatMap((tree) => tree.places.flatMap((place) => place.twigs.flatMap((twig) => twig.leaves))))
    .map((leaf) => leaf.row.id)
    .sort((a, b) => a - b);

describe("device trees", () => {
  it("grows a tree per device with logins of its own: places as branches, providers as twigs, logins as leaves", () => {
    const rows = [
      session(1, 10, 1, 100, work),
      session(2, 11, 1, 100, work),
      session(3, 20, 2, 100, work),
      session(4, 10, 1, 100, home),
      session(5, 20, 2, 200, claudeCode, { approvedFromId: 3, approvalMethod: "code" }),
      session(6, 20, 2, 300, claudeCode, { approvedFromId: 3, approvalMethod: "code" }),
      session(7, 10, 1, 100, { app: "Gmail" }),
    ];
    const forest = buildDeviceForest(rows, options);
    // Devices 200 and 300 only have sessions let in from device 100: no trees of their own.
    expect(forest.map((tree) => tree.device.id)).toEqual([100]);
    const [pc] = forest;
    // Browser profiles first (by name), then apps.
    expect(pc.places.map((place) => place.place)).toEqual(["p:2", "p:1", "a:gmail"]);
    const workPlace = pc.places.find((place) => place.place === "p:1")!;
    expect(workPlace.twigs.map((twig) => [twig.provider.name, twig.leaves.map((leaf) => leaf.row.id)])).toEqual([
      ["Claude", [3]],
      ["Google", [1, 2]],
    ]);
    expect(pc.stats).toEqual({ places: 3, sessions: 7, wilting: 0, fallen: 0, reach: 2 });
  });

  it("hangs the sessions a login let in off it, on whichever device, many at once and in chains", () => {
    // claude.ai in a browser on PC 1; Claude Code on laptops 2 and 3 with a code from it; an app on 4 from laptop 2.
    const rows = [
      session(1, 20, 2, 1, work),
      session(2, 20, 2, 2, claudeCode, { approvedFromId: 1, approvalMethod: "code" }),
      session(3, 20, 2, 3, claudeCode, { approvedFromId: 1, approvalMethod: "code" }),
      session(4, 20, 2, 4, { app: "Claude" }, { approvedFromId: 2, approvalMethod: "link" }),
    ];
    const forest = buildDeviceForest(rows, options);
    expect(forest.map((tree) => tree.device.id)).toEqual([1]);
    const [login] = forest[0].places[0].twigs[0].leaves;
    expect(login.grown.map((leaf) => [leaf.row.device.id, leaf.grown.map((each) => each.row.device.id)])).toEqual([
      [2, [4]],
      [3, []],
    ]);
    expect(forest[0].stats).toMatchObject({ sessions: 4, reach: 3 });

    const { nodes, wires } = layoutDeviceForest(forest);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const twig = nodes.find((node) => node.kind === "twig")!;
    // One tree, so its trunk is at x 0: the laptops in the first column of grown sessions, the app in the second.
    expect([byId.get("s:2")!.x, byId.get("s:3")!.x, byId.get("s:4")!.x]).toEqual([sproutX(1), sproutX(1), sproutX(2)]);
    // The two laptops sit beside the login they came from.
    const loginMiddle = twig.y + DEVICE_TREE_SIZES.twigHeader + DEVICE_TREE_SIZES.sessionHeight / 2;
    expect((byId.get("s:2")!.y + byId.get("s:3")!.y + DEVICE_TREE_SIZES.sproutHeight) / 2).toBeCloseTo(loginMiddle);
    expect(wires.filter((wire) => wire.kind === "graft").map((wire) => [wire.source === twig.id ? "twig" : wire.source, wire.sourceHandle, wire.target, wire.method])).toEqual([
      ["twig", "out-1", "s:2", "code"],
      ["s:2", "out", "s:4", "link"],
      ["twig", "out-1", "s:3", "code"],
    ]);
  });

  it("keeps a signed out login that others were let in from, and shows the rest only with history", () => {
    const rows = [session(1, 20, 2, 100, work, { status: "signed_out" }), session(2, 20, 2, 200, claudeCode, { approvedFromId: 1 }), session(3, 10, 1, 300, home, { status: "signed_out" })];
    const trail = buildDeviceForest(rows, options);
    expect(trail.map((tree) => tree.device.id)).toEqual([100]);
    const [leaf] = trail[0].places[0].twigs[0].leaves;
    expect([leaf.state, leaf.grown.map((each) => each.row.id)]).toEqual(["fallen", [2]]);
    expect(buildDeviceForest(rows, { ...options, history: true }).map((tree) => tree.device.id)).toEqual([100, 300]);
  });

  it("makes a session whose origin is gone, or that is caught in a loop, a login of its own, drawn once", () => {
    const rows = [
      session(1, 20, 2, 100, claudeCode, { approvedFromId: 99, approvalMethod: "code" }),
      session(2, 10, 1, 200, work, { approvedFromId: 3 }),
      session(3, 10, 1, 300, work, { approvedFromId: 2 }),
      session(4, 10, 1, 400, home, { approvedFromId: 3 }),
    ];
    const forest = buildDeviceForest(rows, options);
    expect(forest.map((tree) => tree.device.id)).toEqual([100, 200, 300, 400]);
    expect(drawn(forest)).toEqual([1, 2, 3, 4]);
  });

  it("lights the account on every device, with a dashed link to each of its other logins", () => {
    const rows = [
      session(1, 20, 2, 100, work),
      session(2, 20, 2, 200, claudeCode, { approvedFromId: 1, approvalMethod: "code" }),
      session(3, 20, 2, 300, claudeCode, { approvedFromId: 1, approvalMethod: "code" }),
      session(4, 20, 2, 400, home),
      session(5, 20, 2, 500, claudeCode, { approvedFromId: 4, approvalMethod: "link" }),
      session(6, 10, 1, 100, work),
    ];
    const shown = visibleSignIns(rows, { history: false });
    const lit = relatedSessions(shown, 2);
    expect([...lit.signIns].sort()).toEqual([1, 2, 3, 4, 5]);
    // 1 and 3 are wired to 2 already (its login and its sibling); the other login, 4, gets one dashed link.
    expect(lit.links).toEqual([{ id: "2~4", fromId: 2, toId: 4 }]);
    expect(relatedSessions(shown, 4).links.map((link) => link.toId)).toEqual([1]);
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
      const account = 1 + Math.floor(next() * 8);
      // Some sessions are let in from an earlier one of their account (chains and fans), a few from one removed since.
      const earlier = rows.filter((row) => row.account.id === account);
      const roll = next();
      const approvedFromId = roll < 0.45 && earlier.length > 0 ? earlier[Math.floor(next() * earlier.length)].id : roll > 0.97 ? 999 : null;
      rows.push(
        session(id, account, 1 + (account % 3), 1 + Math.floor(next() * 6), place, {
          status: next() < 0.15 ? "signed_out" : "signed_in",
          approvedFromId,
          approvalMethod: approvedFromId ? "code" : null,
        }),
      );
    }
    return rows;
  }

  it("never lets two nodes overlap, keeps every kind of node in its column and draws every session once", () => {
    const columns = {
      device: 0,
      place: DEVICE_TREE_SIZES.deviceWidth + DEVICE_TREE_SIZES.columnGap,
      twig: DEVICE_TREE_SIZES.deviceWidth + DEVICE_TREE_SIZES.placeWidth + 2 * DEVICE_TREE_SIZES.columnGap,
    };
    for (let seed = 1; seed <= 40; seed += 1) {
      const rows = randomRows(seed);
      const forest = buildDeviceForest(rows, { staleBefore: STALE_BEFORE, history: true });
      expect(drawn(forest), `seed ${seed}`).toEqual(rows.map((row) => row.id));
      const { nodes, wires } = layoutDeviceForest(forest, { aspect: [0.6, 1.6, 3][seed % 3] });
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
        expect(node.x - trunk.x, node.id).toBe(node.kind === "sprout" ? sproutX(node.level) : columns[node.kind]);
      }
      for (const wire of wires) {
        expect(byId.has(wire.source) && byId.has(wire.target), wire.id).toBe(true);
        if (wire.kind !== "graft") continue;
        const source = byId.get(wire.source)!;
        // A graft leaves from the login's row on its twig, or from the grown session's own node.
        if (source.kind === "twig") expect(source.twig.leaves.some((leaf) => `out-${leaf.row.id}` === wire.sourceHandle && leaf.row.id === wire.fromId)).toBe(true);
        else expect(source.kind === "sprout" && source.leaf.row.id === wire.fromId && wire.sourceHandle === "out").toBe(true);
      }
    }
  });
});
