import { float } from "three/tsl";

/**
 * Canonical geometric observation rule, compiled into the existing observer.
 * Normalized U and its gradient determine geometric validity. Compressed raw
 * energy continues to own optical visibility, never this integration rate.
 *
 * The observer owns explicit history availability independently of normals.
 * The first valid current field seeds undefined history directly: interpolating
 * from an invented distance of zero would manufacture a surface.
 * Exact zero validity holds history. No energy
 * threshold, extra clock, mutable state or replay trigger is introduced.
 *
 * @param {any} options
 * @returns {any}
 */
export function deriveCymaticGeometryAssimilation({
  geometryBlend,
  geometryValidity,
  historyAvailable,
}) {
  return geometryBlend
    .greaterThan(0)
    .and(geometryValidity.greaterThan(0))
    .select(
      historyAvailable.select(geometryBlend.mul(geometryValidity), float(1)),
      float(0),
    );
}
