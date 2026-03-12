export const SHELL_COUNT = 32;
export const SHELL_MIN_RADIUS_RATIO = 0.12;
export const SHELL_JITTER_RATIO = 0.1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getShellMinRadius(radius) {
  return radius * SHELL_MIN_RADIUS_RATIO;
}

export function getShellSpacing(radius) {
  if (SHELL_COUNT <= 1) {
    return 0;
  }
  return (radius - getShellMinRadius(radius)) / (SHELL_COUNT - 1);
}

export function getShellRadiusForIndex(index, radius) {
  return (
    getShellMinRadius(radius) +
    clamp(index, 0, SHELL_COUNT - 1) * getShellSpacing(radius)
  );
}

export function quantizeRadiusToShell(rawRadius, radius) {
  const minRadius = getShellMinRadius(radius);
  const shellSpacing = getShellSpacing(radius);
  const clampedRadius = clamp(rawRadius, minRadius, radius);
  const shellIndex =
    shellSpacing > 0
      ? Math.round((clampedRadius - minRadius) / shellSpacing)
      : 0;

  return {
    minRadius,
    shellIndex,
    shellRadius: getShellRadiusForIndex(shellIndex, radius),
    shellSpacing,
  };
}

export function isOuterShellRadius(shellRadius, radius) {
  return shellRadius >= radius - getShellSpacing(radius);
}
