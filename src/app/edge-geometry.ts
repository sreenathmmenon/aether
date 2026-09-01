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
  // Canvas units of clearance at each end. The shipped systems leave about
  // twelve pixels between adjacent cards, so a larger gap consumes the edge
  // it is meant to reveal.
  gap = 2,
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
  const trim = Math.min(0.5, exit(dx, dy) + gap / length);
  // Both ends trim by the same fraction, and never past the midpoint. Trimming
  // each end independently let the two exceed the whole line when the cards
  // sat close together, which drew the edge backwards through both of them.
  return {
    x1: from.x + dx * trim,
    y1: from.y + dy * trim,
    x2: to.x - dx * trim,
    y2: to.y - dy * trim,
  };
}
