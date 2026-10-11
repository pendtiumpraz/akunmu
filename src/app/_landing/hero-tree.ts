/**
 * The tree drawn behind the landing hero, in a 1440 × 660 view box. Nodes are placed first and every wire is drawn
 * from its parent's exact point to its child's, so the dots always sit on the ends of the lines. The root sits under
 * the buttons with its trunk going down into the screenshot; the branches climb both sides around the text.
 */

export const HERO_VIEW = { width: 1440, height: 660 } as const;

export type HeroNode = { id: string; x: number; y: number; parent: string | null; depth: number; tip: boolean };
export type HeroWire = { id: string; from: string; to: string; d: string; depth: number; width: number };

/** The hero's text at desktop width (headline, paragraph, buttons, note), which the wires stay clear of. */
export const HERO_TEXT_AREAS = [
  { left: 370, top: 105, right: 1070, bottom: 268 },
  { left: 385, top: 278, right: 1055, bottom: 398 },
  { left: 598, top: 422, right: 842, bottom: 488 },
  { left: 532, top: 494, right: 908, bottom: 526 },
] as const;

const ROOT = { id: "root", x: 720, y: 598 };
/** Where the trunk comes from: below the view, under the screenshot. */
const TRUNK_BASE = { x: 720, y: 700 };

/** The left half; the right half mirrors it. */
const LEFT: { id: string; x: number; y: number; parent: string }[] = [
  { id: "l1", x: 470, y: 560, parent: "root" },
  { id: "l2", x: 285, y: 445, parent: "l1" },
  { id: "l3", x: 200, y: 300, parent: "l2" },
  { id: "l4", x: 150, y: 168, parent: "l3" },
  { id: "l5", x: 300, y: 205, parent: "l3" },
  { id: "l6", x: 128, y: 505, parent: "l2" },
  { id: "l7", x: 92, y: 345, parent: "l3" },
];

/** A smooth S between two points, leaving and arriving along the longer direction (as the app's wires do). */
export function wirePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return `M${from.x} ${from.y} C${from.x + dx / 2} ${from.y} ${to.x - dx / 2} ${to.y} ${to.x} ${to.y}`;
  return `M${from.x} ${from.y} C${from.x} ${from.y + dy / 2} ${to.x} ${to.y - dy / 2} ${to.x} ${to.y}`;
}

/** Thicker near the root, thinner toward the leaves. */
const WIDTHS = [3, 2.6, 2.2, 1.8, 1.5];

export function heroTree(): { nodes: HeroNode[]; wires: HeroWire[] } {
  const right = LEFT.map((node) => ({ id: node.id.replace("l", "r"), x: HERO_VIEW.width - node.x, y: node.y, parent: node.parent === "root" ? "root" : node.parent.replace("l", "r") }));
  const placed = [{ ...ROOT, parent: null as string | null }, ...LEFT, ...right];
  const byId = new Map(placed.map((node) => [node.id, node]));
  const depthOf = (id: string): number => {
    const parent = byId.get(id)?.parent;
    return parent ? depthOf(parent) + 1 : 0;
  };
  const parents = new Set(placed.map((node) => node.parent).filter(Boolean));
  const nodes: HeroNode[] = placed.map((node) => ({ ...node, depth: depthOf(node.id), tip: !parents.has(node.id) }));
  const wires: HeroWire[] = [
    { id: "trunk", from: "base", to: ROOT.id, d: `M${TRUNK_BASE.x} ${TRUNK_BASE.y} L${ROOT.x} ${ROOT.y}`, depth: 0, width: WIDTHS[0] },
    ...nodes
      .filter((node) => node.parent !== null)
      .map((node) => {
        const parent = byId.get(node.parent ?? "") ?? ROOT;
        return { id: `${parent.id}-${node.id}`, from: parent.id, to: node.id, d: wirePath(parent, node), depth: node.depth, width: WIDTHS[Math.min(node.depth, WIDTHS.length - 1)] };
      }),
  ];
  return { nodes, wires: wires.sort((a, b) => a.depth - b.depth) };
}
