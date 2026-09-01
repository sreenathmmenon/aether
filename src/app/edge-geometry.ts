/**
 * Where a dependency edge should start and stop.
 *
 * Edges were drawn centre-to-centre while the component cards sit above the
 * SVG, so all but a sliver of every edge was hidden underneath them and the
 * dependency graph — the thing the product is about — was effectively
 * invisible. Trimming each end back to the card's boundary draws the part
 * that is actually between the two components.
 */
export type Point = { x: number; y: number };

export function edgeBetween(
  source: Point,
  target: Point,
  extent: { width: number; height: number },
  gap = 6,
) {
  const halfWidth = extent.width / 2;
  const halfHeight = extent.height / 2;
  const centreOffset = { x: halfWidth, y: halfHeight };
  const from = { x: source.x + centreOffset.x, y: source.y + centreOffset.y };
  const to = { x: target.x + centreOffset.x, y: target.y + centreOffset.y };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0)
    return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };

  // Distance from a card's centre to where the line leaves its rectangle.
  const exit = (deltaX: number, deltaY: number) => {
    const scaleX = deltaX === 0 ? Infinity : halfWidth / Math.abs(deltaX);
    const scaleY = deltaY === 0 ? Infinity : halfHeight / Math.abs(deltaY);
    return Math.min(scaleX, scaleY);
  };

  const length = Math.hypot(dx, dy);
  const startScale = exit(dx, dy);
  const endScale = exit(dx, dy);
  const startTrim = Math.min(1, startScale + gap / length);
  const endTrim = Math.min(1, endScale + gap / length);
  return {
    x1: from.x + dx * startTrim,
    y1: from.y + dy * startTrim,
    x2: to.x - dx * endTrim,
    y2: to.y - dy * endTrim,
  };
}
