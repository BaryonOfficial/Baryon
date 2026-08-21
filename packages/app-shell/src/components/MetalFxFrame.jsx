import React from "react";
import { MetalFx } from "metal-fx";

/**
 * MetalFx paints its ring through WebGL, which some browsers withhold —
 * Safari's Lockdown Mode removes it outright. A failure there must cost the
 * host its ring, never its control, so the wrapped child renders bare instead.
 */
class MetalFxBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Wraps a single host element in the chromatic metal ring, falling back to the
 * bare element when WebGL is unavailable. Hosts whose ring also carries frame
 * styling pass their own `fallback` so the ringless render keeps that frame.
 *
 * @param {import("react").ComponentProps<typeof MetalFx> & {
 *   fallback?: import("react").ReactNode,
 * }} props
 */
export default function MetalFxFrame({ children, fallback, ...metalProps }) {
  return (
    <MetalFxBoundary fallback={fallback ?? children}>
      <MetalFx {...metalProps}>{children}</MetalFx>
    </MetalFxBoundary>
  );
}
