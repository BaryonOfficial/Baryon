export const AR_LAB_PATH = "/ar-lab";

export const AR_LAB_MODES = Object.freeze({
  // Milestone 0 hardware proof: WebGPU + XR host with one inert sphere and
  // no Baryon pipeline, providers, audio, controls, hands, or recording.
  hostProof: "host-proof",
  // Milestones 1-3: real Baryon orb, hands, and recording.
  full: "full",
});

/**
 * @param {string | null | undefined} pathname
 * @returns {boolean}
 */
export function isArLabPath(pathname) {
  if (typeof pathname !== "string") {
    return false;
  }

  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === AR_LAB_PATH;
}

/**
 * @param {string | null | undefined} search
 * @returns {"host-proof" | "full"}
 */
export function resolveArLabMode(search) {
  if (typeof search !== "string" || search.length === 0) {
    return AR_LAB_MODES.full;
  }

  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  return params.get("mode") === AR_LAB_MODES.hostProof
    ? AR_LAB_MODES.hostProof
    : AR_LAB_MODES.full;
}
