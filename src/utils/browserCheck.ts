// Add local storage key as a constant
const OVERRIDE_KEY = 'browser-check-override';

export function isUnsupportedBrowser() {
  // Check if user has chosen to override
  const hasOverride = localStorage.getItem(OVERRIDE_KEY) === 'true';

  // Check for mobile/tablet
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

  // Check for unsupported browsers
  const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  // Check for required features
  const hasWebGL2 = !!document.createElement('canvas').getContext('webgl2');
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

  return {
    isUnsupported:
      !hasOverride && (isMobile || isFirefox || isSafari || !hasWebGL2 || !hasSharedArrayBuffer),
    reasons: {
      isMobile,
      isFirefox,
      isSafari,
      noWebGL2: !hasWebGL2,
      noSharedArrayBuffer: !hasSharedArrayBuffer,
    },
  };
}

export function setOverrideBrowserCheck(override: boolean) {
  if (override) localStorage.setItem(OVERRIDE_KEY, 'true');
  else localStorage.removeItem(OVERRIDE_KEY);
}
