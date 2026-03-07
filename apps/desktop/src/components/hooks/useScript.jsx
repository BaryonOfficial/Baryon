// src/hooks/useScript.js
import { useEffect, useState } from 'react';

const useScript = (src) => {
  const [status, setStatus] = useState({ loaded: false, error: null });

  useEffect(() => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;

    const onScriptLoad = () => setStatus({ loaded: true, error: null });
    const onScriptError = () => setStatus({ loaded: true, error: 'Failed to load script' });

    script.addEventListener('load', onScriptLoad);
    script.addEventListener('error', onScriptError);

    document.body.appendChild(script);

    return () => {
      script.removeEventListener('load', onScriptLoad);
      script.removeEventListener('error', onScriptError);
      document.body.removeChild(script);
    };
  }, [src]);

  return status;
};

export default useScript;
