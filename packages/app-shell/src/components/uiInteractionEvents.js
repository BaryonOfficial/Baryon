export const BARYON_UI_INTERACTION_EVENT = "__baryon-ui-interaction";
export const UI_INTERACTION_ADAPTIVE_SUPPRESSION_MS = 850;

export const UI_INTERACTION_SOURCES = Object.freeze({
  advancedControls: "advanced-controls",
});

export function dispatchBaryonUiInteraction(detail = {}) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(BARYON_UI_INTERACTION_EVENT, {
      detail,
    }),
  );
}
