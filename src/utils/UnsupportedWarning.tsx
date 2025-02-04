import React from 'react';

const UnsupportedWarning = () => (
  <div
    style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(255, 0, 0, 0.8)',
      color: 'white',
      padding: '10px',
      textAlign: 'center',
      zIndex: 1000,
    }}
  >
    The music visualizer is not supported on mobile, tablet and/or your browser. Please use a
    Chromium-based browser (like Chrome, Brave or Edge) on a desktop for the best experience.
  </div>
);

export default UnsupportedWarning;
