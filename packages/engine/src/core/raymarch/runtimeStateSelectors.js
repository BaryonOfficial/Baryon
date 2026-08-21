// Pure selectors shared by live runtime behavior and diagnostic projection.
// Keeping these reads neutral prevents diagnostics from becoming an authority.
import {
  DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  normalizeCavityGeometry,
} from "../cavityGeometry.js";
import { getBoundaryModeFromValue } from "../modeFamily.js";
import { deriveStructuralProjectionDrive } from "./fieldObservation.js";

export const RENDER_AUTHORITY_DISPLAY_HOLD_SEC = 0.12;

export function resolveRaymarchStructuralProjectionDrive(
  runtimeState,
  activeCount,
  featureFrame = null,
) {
  const sourceIdentities =
    featureFrame?.modalDescriptor?.slotViews?.modalIdentitySlots ??
    featureFrame?.modalIdentitySlots ??
    runtimeState?.raymarchUploadState?.basisPlan?.identitySlots ??
    null;
  const sourceCoefficients =
    featureFrame?.modalDescriptor?.slotViews?.modalCoefficientSlots ??
    featureFrame?.modalCoefficientSlots ??
    runtimeState?.raymarchUploadState?.driveFrame?.coefficients ??
    null;
  return deriveStructuralProjectionDrive({
    modalIdentitySlots: sourceIdentities,
    modalCoefficientSlots: sourceCoefficients,
    activeCount: Math.max(0, Math.floor(activeCount ?? 0)),
  });
}

export function getRuntimeBoundaryMode(runtimeState) {
  return getBoundaryModeFromValue(
    runtimeState.uniforms.uBoundaryMode?.value ?? 1,
  );
}

export function getRuntimeEffectiveCavityGeometry(runtimeState) {
  return normalizeCavityGeometry(
    runtimeState?.effectiveCavityGeometry ??
      runtimeState?.volumeMesh?.userData?.raymarchCavityGeometry ??
      DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  );
}
