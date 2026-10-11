import { describe, expect, it } from "vitest";
import { HERO_TEXT_AREAS, HERO_VIEW, heroTree } from "@/app/_landing/hero-tree";

/** Points along a path made of one move and one cubic curve or line (what heroTree writes). */
function sample(d: string, steps = 40): { x: number; y: number }[] {
  const numbers = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (d.includes("L")) {
    const [x0, y0, x1, y1] = numbers;
    return Array.from({ length: steps + 1 }, (_, index) => ({ x: x0 + ((x1 - x0) * index) / steps, y: y0 + ((y1 - y0) * index) / steps }));
  }
  const [x0, y0, x1, y1, x2, y2, x3, y3] = numbers;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const u = 1 - t;
    return {
      x: u ** 3 * x0 + 3 * u ** 2 * t * x1 + 3 * u * t ** 2 * x2 + t ** 3 * x3,
      y: u ** 3 * y0 + 3 * u ** 2 * t * y1 + 3 * u * t ** 2 * y2 + t ** 3 * y3,
    };
  });
}

describe("landing hero tree", () => {
  const { nodes, wires } = heroTree();
  const byId = new Map(nodes.map((node) => [node.id, node]));

  it("draws every wire from its parent's dot to its child's dot", () => {
    for (const wire of wires.filter((candidate) => candidate.id !== "trunk")) {
      const points = sample(wire.d);
      const [start, end] = [points[0], points.at(-1)!];
      expect(start).toEqual({ x: byId.get(wire.from)!.x, y: byId.get(wire.from)!.y });
      expect(end).toEqual({ x: byId.get(wire.to)!.x, y: byId.get(wire.to)!.y });
    }
    const trunk = sample(wires.find((wire) => wire.id === "trunk")!.d);
    expect(trunk.at(-1)).toEqual({ x: byId.get("root")!.x, y: byId.get("root")!.y });
  });

  it("is mirrored, and every node except the root has exactly one wire into it", () => {
    for (const node of nodes) {
      if (node.id === "root") continue;
      expect(wires.filter((wire) => wire.to === node.id)).toHaveLength(1);
      const twin = byId.get(node.id.startsWith("l") ? node.id.replace("l", "r") : node.id.replace("r", "l"))!;
      expect(twin.x).toBe(HERO_VIEW.width - node.x);
      expect(twin.y).toBe(node.y);
    }
    expect(nodes.filter((node) => node.tip).length).toBeGreaterThanOrEqual(6);
  });

  it("keeps lines and dots out of the hero text", () => {
    const inText = (point: { x: number; y: number }) =>
      HERO_TEXT_AREAS.some((area) => point.x >= area.left && point.x <= area.right && point.y >= area.top && point.y <= area.bottom);
    for (const wire of wires) expect(sample(wire.d).filter(inText), wire.id).toEqual([]);
    for (const node of nodes) expect(inText(node), node.id).toBe(false);
  });
});
