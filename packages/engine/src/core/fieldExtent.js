/** @typedef {"sphere" | "unbounded"} FieldExtent */

export const FIELD_EXTENTS = Object.freeze({
  sphere: "sphere",
  unbounded: "unbounded",
});

const FIELD_EXTENT_VALUES = Object.freeze({
  [FIELD_EXTENTS.sphere]: 0,
  [FIELD_EXTENTS.unbounded]: 1,
});

// Unbounded render domain: the march sphere grows to this multiple of the
// flagship field radius. The modal solve and every field cache stay on the
// original radius — only the render domain extends. The reach covers the
// canvas corners at flagship framing, so the traveling waves propagate
// through the whole visible frame and end by absorption, never at a
// visible bound. Radial-adaptive stepping keeps the cost near the old
// compact reach: core samples stay at flagship density while the smooth
// radiating zone takes stretched steps.
export const UNBOUNDED_DOMAIN_SCALE = 3.0;
// Step budget relative to the user's Steps control. Combined with the
// adaptive stretch below, the worst-case chord (core at fine density plus
// the remaining domain at stretched density) fits this budget with core
// sample spacing matching the compact-reach build.
export const UNBOUNDED_STEP_SCALE = 0.89;
// Dense-march radius (in field radii): flagship sample density through the
// cavity and the whole cavity→radiating travel blend; must cover
// UNBOUNDED_TRAVEL_BLEND_END so the morph zone never gets coarse steps.
export const UNBOUNDED_CORE_STEP_RADIUS_SCALE = 1.3;
// Step stretch outside the dense core. Sized to keep ≥4 samples per
// traveling wavelength (2π / UNBOUNDED_RADIAL_PHASE_GAIN) so the expanding
// shells stay smooth.
export const UNBOUNDED_OUTER_STEP_STRETCH = 1.9;
// Radial display-energy falloff beyond the flagship radius. This scales the
// emitted radiance and extinction of the final sample exactly once — the
// folded pattern itself stays at full strength for structure classification,
// so decay is linear in luminance (never squared through authority products).
// Nodal directions land under ~10% at the march bound; excited lobes keep
// real energy into the fail-safe fade band, which owns the final dissolve.
export const UNBOUNDED_FIELD_FALLOFF = 2.6;
// Local modal support extends the energy reach: directions where the
// continued interference pattern carries real energy penetrate farther, so
// the silhouette is the shape of the sound (petals, plumes), never a ball.
export const UNBOUNDED_REACH_EXTENSION = 0.55;
// Normalized modal support is small in absolute terms (typically 0.1–0.3 in
// excited lobes), so presence is calibrated through this smoothstep window —
// without it the reach extension never engages and every direction decays at
// near-nodal rate.
export const UNBOUNDED_SUPPORT_PRESENCE_START = 0.02;
export const UNBOUNDED_SUPPORT_PRESENCE_END = 0.18;
// The photographic blackfield gate needs focus evidence to leave its dark
// regime. The sphere variant gets that lift from the radial shell stack; the
// unbounded field replaces it with this radially uniform presence so the
// core keeps flagship-level exposure without implying any container.
export const UNBOUNDED_FOCUS_PRESENCE = 0.85;
// Radial wavenumber of the traveling wavefronts — how many expanding shells
// span the extension. The far field is D(θ,φ)·cos(k·r − ω·t)·decay(r): the
// modal pattern's angular directivity carried outward by concentric
// traveling waves, which is how sound actually propagates from a compact
// source — never a mirror tiling of the cavity interior (reads as discrete
// bounded copies, not radiation).
export const UNBOUNDED_RADIAL_PHASE_GAIN = 12.4;
// Continuous outward phase speed between beats (the beat-phase term advances
// the wavefronts one wavelength per beat on top of this).
export const UNBOUNDED_WAVE_DRIFT = 2.4;
// The angular directivity is the live modal field sampled mid-cavity along
// each ray's direction — interior, not the old sphere surface, and constant
// along the ray so it can never imprint a radial shell.
export const UNBOUNDED_DIRECTIVITY_RADIUS = 0.62;
// Cavity → radiating-field transition band. Wide on purpose: the standing
// core morphs into traveling waves across half a radius, so no seam or
// shell feature appears anywhere near r = 1.
export const UNBOUNDED_TRAVEL_BLEND_START = 0.8;
export const UNBOUNDED_TRAVEL_BLEND_END = 1.3;
// Fail-safe outer fade, expressed as fractions of the unbounded domain radius.
// Absorption owns the visible falloff; this only guarantees zero at the bound.
export const UNBOUNDED_OUTER_FADE_START = 0.88;
export const UNBOUNDED_OUTER_FADE_END = 0.997;
// Radial shell emphasis reads as a container wall; unbounded mode flattens the
// shell ramp to its midpoint so no spherical rim is implied.
export const UNBOUNDED_SHELL_RAMP = 0.28;

/**
 * @param {unknown} value
 * @returns {FieldExtent}
 */
export function normalizeFieldExtent(value) {
  return value === FIELD_EXTENTS.unbounded
    ? FIELD_EXTENTS.unbounded
    : FIELD_EXTENTS.sphere;
}

/** @param {unknown} extent */
export function getFieldExtentValue(extent) {
  return FIELD_EXTENT_VALUES[normalizeFieldExtent(extent)];
}

/** @param {number} value */
export function getFieldExtentFromValue(value) {
  return value >= 0.5 ? FIELD_EXTENTS.unbounded : FIELD_EXTENTS.sphere;
}

/** @param {unknown} extent */
export function getFieldExtentDomainScale(extent) {
  return normalizeFieldExtent(extent) === FIELD_EXTENTS.unbounded
    ? UNBOUNDED_DOMAIN_SCALE
    : 1;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

/**
 * CPU mirror of the GPU display-energy profile: inside the flagship radius
 * the sample is untouched; beyond it, emitted radiance and extinction fade
 * exponentially with distance. Local modal support slows the falloff, so
 * excited lobes reach farther than nodal directions and the field's own
 * amplitude defines the silhouette. Applied once at the sample output —
 * never to the field, gradient, or support the structure lanes classify.
 *
 * @param {{
 *   radialDistance?: number,
 *   falloff?: number,
 *   supportPresence?: number,
 *   reachExtension?: number,
 * }} [options]
 */
export function deriveUnboundedFieldEnvelope({
  radialDistance = 0,
  falloff = UNBOUNDED_FIELD_FALLOFF,
  supportPresence = 0,
  reachExtension = UNBOUNDED_REACH_EXTENSION,
} = {}) {
  const safeRadialDistance = Math.max(
    0,
    Number.isFinite(radialDistance) ? radialDistance : 0,
  );
  const safeFalloff = Math.max(0, Number.isFinite(falloff) ? falloff : 0);
  const effectiveFalloff =
    safeFalloff * (1 - clamp01(reachExtension) * clamp01(supportPresence));
  const radialExcess = Math.max(0, safeRadialDistance - 1);

  return Math.exp(-radialExcess * effectiveFalloff);
}
