import { useEffect, useState } from "react";
import {
  BROWSER_FAILURE_CODES,
  BROWSER_SUPPORT_STATUS,
  createFailureProbe,
  createRendererInitFailureProbe,
  getInitialBrowserSupportStatus,
  isMobileDevice,
  probeBrowserSupport,
} from "../browserSupport.js";

const MOBILE_UNSUPPORTED_DIAGNOSTIC =
  "Mobile browsers are currently treated as unsupported.";

function getUnsupportedReason(probe) {
  return probe?.failureCode === BROWSER_FAILURE_CODES.mobileUnsupported
    ? "mobile"
    : "browser";
}

function getInitialSupportProbe(useWebGLRenderer) {
  if (useWebGLRenderer || !isMobileDevice()) {
    return null;
  }

  return createFailureProbe({
    failureCode: BROWSER_FAILURE_CODES.mobileUnsupported,
    diagnostics: [MOBILE_UNSUPPORTED_DIAGNOSTIC],
  });
}

/**
 * Owns the browser capability probe that gates renderer startup and powers
 * user-facing diagnostics for unsupported environments.
 */
export function useBrowserSupportState(useWebGLRenderer) {
  const [browserSupportStatus, setBrowserSupportStatus] = useState(() =>
    getInitialBrowserSupportStatus(useWebGLRenderer),
  );
  const [supportProbe, setSupportProbe] = useState(() =>
    getInitialSupportProbe(useWebGLRenderer),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (supportProbe) {
      window.__baryonSupportProbe = supportProbe;
      return;
    }

    delete window.__baryonSupportProbe;
  }, [supportProbe]);

  useEffect(() => {
    let isCancelled = false;

    if (!useWebGLRenderer && isMobileDevice()) {
      setBrowserSupportStatus(BROWSER_SUPPORT_STATUS.unsupported);
      setSupportProbe(
        createFailureProbe({
          failureCode: BROWSER_FAILURE_CODES.mobileUnsupported,
          diagnostics: [MOBILE_UNSUPPORTED_DIAGNOSTIC],
        }),
      );
      return undefined;
    }

    setBrowserSupportStatus(BROWSER_SUPPORT_STATUS.checking);
    setSupportProbe(null);

    void (async () => {
      const probe = await probeBrowserSupport(useWebGLRenderer);
      if (!isCancelled) {
        setBrowserSupportStatus(probe.status);
        setSupportProbe(probe);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [useWebGLRenderer]);

  const markRendererInitUnsupported = (error) => {
    setBrowserSupportStatus(BROWSER_SUPPORT_STATUS.unsupported);
    setSupportProbe(createRendererInitFailureProbe(error));
  };

  return {
    browserSupportStatus,
    supportProbe,
    unsupportedReason: getUnsupportedReason(supportProbe),
    isUnsupported: browserSupportStatus === BROWSER_SUPPORT_STATUS.unsupported,
    isSupportReady: browserSupportStatus === BROWSER_SUPPORT_STATUS.supported,
    markRendererInitUnsupported,
  };
}
