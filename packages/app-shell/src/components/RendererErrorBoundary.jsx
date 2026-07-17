import { Component } from "react";

/** @type {import("react").CSSProperties} */
const RENDERER_ERROR_STYLE = {
  color: "rgba(255, 255, 255, 0.82)",
  display: "grid",
  fontFamily: "var(--baryon-type-mono-family)",
  fontSize: "0.8rem",
  gap: "0.75rem",
  minHeight: "100%",
  placeContent: "center",
  textAlign: "center",
};

/**
 * @extends {Component<{
 *   resetKey: string,
 *   onError?: (error: unknown) => void,
 *   fallback?: import("react").ReactNode | ((props: { error: unknown, retry: () => void }) => import("react").ReactNode),
 *   children?: import("react").ReactNode,
 * }, { error: unknown | null }>}
 */
export class RendererErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    this.props.onError?.(error);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  retry() {
    this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback({
          error: this.state.error,
          retry: this.retry,
        });
      }
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      return (
        <div role="alert" style={RENDERER_ERROR_STYLE}>
          <span>Rendering stopped unexpectedly.</span>
          <button type="button" onClick={this.retry}>
            Retry render
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
