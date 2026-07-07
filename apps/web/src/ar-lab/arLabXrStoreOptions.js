/**
 * @returns {import("@react-three/xr").XRStoreOptions}
 */
export function createArLabXrStoreOptions() {
  return {
    domOverlay: true,
    offerSession: false,
    enterGrantedSession: false,
  };
}
