const TOOLTIP_MARGIN_PX = 8;
const TOOLTIP_GAP_PX = 10;

export function resolveAdvancedControlsHelpPosition({
  anchorRect,
  tooltipRect,
  viewportWidth,
  viewportHeight,
  gap = TOOLTIP_GAP_PX,
  margin = TOOLTIP_MARGIN_PX,
}) {
  const spaceOnRight = viewportWidth - anchorRect.right - margin;
  const spaceOnLeft = anchorRect.left - margin;
  const placeRight =
    spaceOnRight >= tooltipRect.width || spaceOnRight >= spaceOnLeft;

  const unclampedLeft = placeRight
    ? anchorRect.right + gap
    : anchorRect.left - gap - tooltipRect.width;
  const maxLeft = viewportWidth - tooltipRect.width - margin;
  const left = Math.min(Math.max(unclampedLeft, margin), maxLeft);

  const centeredTop =
    anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2;
  const maxTop = viewportHeight - tooltipRect.height - margin;
  const top = Math.min(Math.max(centeredTop, margin), maxTop);

  return {
    left,
    top,
    horizontal: placeRight ? "right" : "left",
    vertical: top === margin ? "top" : top === maxTop ? "bottom" : "center",
    transformOrigin: `${placeRight ? "left" : "right"} ${
      top === margin ? "top" : top === maxTop ? "bottom" : "center"
    }`,
  };
}
