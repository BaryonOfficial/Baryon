interface UnsupportedWarningProps {
  reasons: {
    isMobile: boolean;
    isFirefox: boolean;
    isSafari: boolean;
    noWebGL2: boolean;
    noSharedArrayBuffer: boolean;
  };
}

export function UnsupportedWarning({ reasons }: UnsupportedWarningProps) {
  const getWarningMessage = () => {
    const messages = [];
    if (reasons.isMobile) messages.push('mobile devices');
    if (reasons.isFirefox) messages.push('Firefox');
    if (reasons.isSafari) messages.push('Safari');
    if (reasons.noWebGL2) messages.push('browsers without WebGL2');
    if (reasons.noSharedArrayBuffer) messages.push('browsers without SharedArrayBuffer support');

    return messages.join(', ');
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black text-white p-8">
      <div className="max-w-2xl text-center space-y-4">
        <h1 className="text-2xl font-bold mb-4">Browser Not Supported</h1>
        <p>
          This music visualizer is not supported on {getWarningMessage()}. Please use a
          Chromium-based browser (like Chrome, Brave, or Edge) on a desktop computer for the best
          experience.
        </p>
        <p className="text-sm opacity-75">
          Required features: WebGL2, SharedArrayBuffer, and modern audio processing capabilities.
        </p>
      </div>
    </div>
  );
}
