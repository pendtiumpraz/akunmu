import { describe, expect, it } from "vitest";
import { TREE_SIZES, buildForest, columnX, layoutForest, leafState, relatedToSignIn, type TreeSignIn } from "@/modules/signins/tree";

const NOW = "2026-10-11T00:00:00.000Z";
const STALE_BEFORE = "2026-09-11T00:00:00.000Z";

type Row = TreeSignIn & { place: string };

/** A sign-in of `account` on `device` (ids double as names), optionally grown from another sign-in. */
function row(id: number, account: number, device: number, extra: Partial<Row> = {}): Row {
  return {
    id,
    status: "signed_in",
    approvedFromId: null,
    approvalMethod: null,
    review: false,
    lastVerifiedAt: NOW,
    account: { id: account, identifier: `account${account}@example.com`, label: null },
    provider: { name: "Google" },
    device: { id: device, name: `Device ${device}` },
    place: `place ${id}`,
    ...extra,
  };
}

describe("account trees", () => {
  it("roots the account on the devices it was signed in directly, and branches where it was let in from there", () => {
    const rows = [
      row(1, 7, 10), // Device 10, Chrome: signed in directly (root)
      row(2, 7, 20, { approvedFromId: 1, approvalMethod: "code" }), // CLI on device 20, code approved in that Chrome
      row(3, 7, 30, { approvedFromId: 2, approvalMethod: "qr" }), // device 30 from device 20
      row(4, 7, 40), // another root
      row(5, 7, 20), // a second place on device 20, signed in directly
    ];
    const [tree] = buildForest(rows, { staleBefore: STALE_BEFORE, history: false });
    expect(tree.branches.map((branch) => [branch.device.id, branch.depth, branch.parentKey])).toEqual([
      [10, 1, null],
      [20, 2, "b:7:10"],
      [30, 3, "b:7:20"],
      [40, 1, null],
    ]);
    expect(tree.branches[1].via).toEqual({ fromId: 1, toId: 2, method: "code" });
    expect(tree.branches[1].leaves.map((leaf) => leaf.row.id)).toEqual([2, 5]);
    expect(tree.stats).toEqual({ devices: 4, leaves: 5, wilting: 0, fallen: 0 });
  });

  it("keeps a signed out place an active one grew from, and shows the rest of the history only on request", () => {
    const rows = [
      row(1, 7, 10, { status: "signed_out" }),
      row(2, 7, 20, { approvedFromId: 1, approvalMethod: "link" }),
      row(3, 7, 30, { status: "signed_out" }),
      row(4, 8, 10, { status: "signed_out" }),
    ];
    const trees = buildForest(rows, { staleBefore: STALE_BEFORE, history: false });
    expect(trees).toHaveLength(1);
    expect(trees[0].branches.map((branch) => branch.device.id)).toEqual([10, 20]);
    expect(trees[0].branches[0].leaves[0].state).toBe("fallen");
    expect(trees[0].stats).toEqual({ devices: 2, leaves: 1, wilting: 0, fallen: 1 });

    const everything = buildForest(rows, { staleBefore: STALE_BEFORE, history: true });
    expect(everything.map((tree) => tree.account.id)).toEqual([7, 8]);
    expect(everything[0].branches.map((branch) => branch.device.id)).toEqual([10, 20, 30]);
  });

  it("marks places to check as wilting", () => {
    expect(leafState({ status: "signed_in", review: false, lastVerifiedAt: "2026-08-01T00:00:00.000Z" }, STALE_BEFORE)).toBe("wilting");
    expect(leafState({ status: "signed_in", review: true, lastVerifiedAt: NOW }, STALE_BEFORE)).toBe("wilting");
    expect(leafState({ status: "signed_out", review: false, lastVerifiedAt: NOW }, STALE_BEFORE)).toBe("fallen");
  });

  it("survives approvals that point at each other", () => {
    const rows = [row(1, 7, 10, { approvedFromId: 2, approvalMethod: "code" }), row(2, 7, 20, { approvedFromId: 1, approvalMethod: "code" })];
    const [tree] = buildForest(rows, { staleBefore: STALE_BEFORE, history: false });
    // Device 10 takes device 20 as its origin first; device 20 then cannot grow from device 10 and becomes the root.
    expect(tree.branches.map((branch) => [branch.device.id, branch.depth])).toEqual([
      [20, 1],
      [10, 2],
    ]);
    const layout = layoutForest([tree]);
    expect(layout.nodes).toHaveLength(3);
  });

  it("lights up the places a sign-in grew from and grew into", () => {
    const rows = [row(1, 7, 10), row(2, 7, 20, { approvedFromId: 1 }), row(3, 7, 30, { approvedFromId: 2 }), row(4, 7, 40)];
    const [tree] = buildForest(rows, { staleBefore: STALE_BEFORE, history: false });
    const related = relatedToSignIn(tree, 2);
    expect([...related.signIns].sort()).toEqual([1, 2, 3]);
    expect([...related.branches].sort()).toEqual(["b:7:10", "b:7:20", "b:7:30"]);
  });
});

describe("tree layout", () => {
  /** A deterministic pseudo-random forest: many accounts, devices and approvals between them. */
  function randomForest(seed: number) {
    let state = seed;
    const next = () => {
      state = (state * 1103515245 + 12345) % 2 ** 31;
      return state / 2 ** 31;
    };
    const rows: Row[] = [];
    let id = 1;
    for (let account = 1; account <= 9; account += 1) {
      const count = 1 + Math.floor(next() * 9);
      const mine: Row[] = [];
      for (let index = 0; index < count; index += 1) {
        const origin = mine.length > 0 && next() < 0.6 ? mine[Math.floor(next() * mine.length)] : null;
        const created = row(id, account, 1 + Math.floor(next() * 7), {
          approvedFromId: origin?.id ?? null,
          approvalMethod: origin ? "code" : null,
          status: next() < 0.15 ? "signed_out" : "signed_in",
        });
        id += 1;
        mine.push(created);
      }
      rows.push(...mine);
    }
    return buildForest(rows, { staleBefore: STALE_BEFORE, history: true });
  }

  it("never lets two nodes overlap, keeps columns aligned and wires on existing ports", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const layout = layoutForest(randomForest(seed), { aspect: [0.6, 1.6, 3][seed % 3] });
      const { nodes, wires } = layout;
      for (let a = 0; a < nodes.length; a += 1) {
        for (let b = a + 1; b < nodes.length; b += 1) {
          const [first, second] = [nodes[a], nodes[b]];
          const apart =
            first.x + first.width <= second.x ||
            second.x + second.width <= first.x ||
            first.y + first.height <= second.y ||
            second.y + second.height <= first.y;
          expect(apart, `seed ${seed}: ${first.id} overlaps ${second.id}`).toBe(true);
        }
      }
      // Every device sits in its depth's column, counted from its own trunk.
      for (const node of nodes) {
        const trunk = nodes.find((candidate) => candidate.kind === "account" && candidate.tree === node.tree)!;
        expect(node.x - trunk.x).toBe(columnX(node.depth));
      }
      const byId = new Map(nodes.map((node) => [node.id, node]));
      for (const wire of wires) {
        const source = byId.get(wire.source);
        const target = byId.get(wire.target);
        expect(source && target, `seed ${seed}: wire ${wire.id}`).toBeTruthy();
        if (wire.kind === "trunk") {
          expect(source?.kind).toBe("account");
          expect(target?.kind === "branch" && target.ports.header).toBe(true);
        } else {
          expect(source?.kind === "branch" && source.ports.leafOut.includes(wire.fromId ?? -1)).toBe(true);
          expect(target?.kind === "branch" && target.ports.leafIn.includes(wire.toId ?? -1)).toBe(true);
          // A graft always reaches one column further right.
          if (wire.kind === "graft") expect(target!.x - source!.x).toBe(TREE_SIZES.branchWidth + TREE_SIZES.columnGap);
        }
      }
      expect(layout.height).toBeGreaterThan(0);
    }
  });

  it("packs many trees into columns that fit a wide screen, one column for a narrow one", () => {
    const rows = Array.from({ length: 12 }, (_, index) => row(index + 1, index + 1, 10));
    const trees = buildForest(rows, { staleBefore: STALE_BEFORE, history: false });
    const wide = layoutForest(trees, { aspect: 2 });
    const narrow = layoutForest(trees, { aspect: 0.2 });
    const columns = (layout: ReturnType<typeof layoutForest>) => new Set(layout.nodes.filter((node) => node.kind === "account").map((node) => node.x)).size;
    expect(columns(wide)).toBeGreaterThan(1);
    expect(columns(narrow)).toBe(1);
    expect(wide.width / wide.height).toBeGreaterThan(narrow.width / narrow.height);
  });

  it("centers each device on the devices grown from it", () => {
    const rows = [row(1, 7, 10), row(2, 7, 20, { approvedFromId: 1 }), row(3, 7, 30, { approvedFromId: 1 }), row(4, 7, 40, { approvedFromId: 1 })];
    const { nodes } = layoutForest(buildForest(rows, { staleBefore: STALE_BEFORE, history: false }));
    const parent = nodes.find((node) => node.id === "b:7:10")!;
    const kids = nodes.filter((node) => node.depth === 2);
    const kidsMiddle = (Math.min(...kids.map((node) => node.y)) + Math.max(...kids.map((node) => node.y + node.height))) / 2;
    expect(Math.abs(parent.y + parent.height / 2 - kidsMiddle)).toBeLessThan(1);
  });
});
