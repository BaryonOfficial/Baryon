import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Reports the OS-level reduced-motion preference so animated chrome can hold
 * still. Hosts without `matchMedia` — server rendering, bare test harnesses —
 * report no preference rather than throwing.
 */
export function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => globalThis.matchMedia?.(REDUCED_MOTION_QUERY).matches === true,
  );

  useEffect(() => {
    const media = globalThis.matchMedia?.(REDUCED_MOTION_QUERY);
    if (!media) {
      return undefined;
    }

    const syncPreference = () => setPrefersReducedMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  return prefersReducedMotion;
}
