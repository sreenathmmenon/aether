import type { ArchitectureEntity } from "@domain/architecture/types";

/** The design space the canvas positions components in. */
export const canvasWidth = 1000;
export const canvasHeight = 700;

/**
 * The largest node box observed in that design space. A node grows a little
 * with its content, and a rectangle that is slightly generous still reads
 * correctly while one that is slightly tight cuts through a component.
 */
export const defaultNodeExtent = { width: 176, height: 104 };

/** Margin around the outermost members, with room above for the label. */
export const regionPadding = { x: 26, top: 30, bottom: 22 };

export type RegionRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/**
 * The rectangle enclosing a region's own components, in design units.
 *
 * A node is centred on its position by `translate(-50%, -50%)`, so the
 * rectangle reaches half a node beyond the outermost members in every
 * direction. Both the canvas and the layout tests read this, because a test
 * carrying its own copy of the geometry would pass while the canvas drew a
 * component outside its own failure domain.
 */
export function regionRect(
  members: ArchitectureEntity[],
  nodeExtent = defaultNodeExtent,
): RegionRect | undefined {
  if (members.length === 0) return undefined;
  const reachX = nodeExtent.width / 2;
  const reachY = nodeExtent.height / 2;
  const xs = members.map((member) => member.position.x);
  const ys = members.map((member) => member.position.y);
  return {
    left: Math.max(0, Math.min(...xs) - reachX - regionPadding.x),
    top: Math.max(0, Math.min(...ys) - reachY - regionPadding.top),
    right: Math.min(canvasWidth, Math.max(...xs) + reachX + regionPadding.x),
    bottom: Math.min(
      canvasHeight,
      Math.max(...ys) + reachY + regionPadding.bottom,
    ),
  };
}

/** The same rectangle expressed as CSS percentages of the canvas. */
export function regionRectPercent(rect: RegionRect) {
  return {
    left: (rect.left / canvasWidth) * 100,
    top: (rect.top / canvasHeight) * 100,
    width: ((rect.right - rect.left) / canvasWidth) * 100,
    height: ((rect.bottom - rect.top) / canvasHeight) * 100,
  };
}
