import { Component } from "react";

/** @type {import("react").CSSProperties} */
const APP_ERROR_ROOT_STYLE = {
  alignContent: "center",
  background: "#050505",
  color: "rgba(255, 255, 255, 0.86)",
  display: "grid",
  gap: "0.85rem",
  justifyItems: "center",
  minHeight: "100vh",
  padding: "2rem",
  textAlign: "center",
};
const APP_ERROR_ACTIONS_STYLE = { display: "flex", gap: "0.65rem" };
const APP_ERROR_COPY_STYLE = { margin: 0 };

/**
 * Last-resort recovery boundary for an application root. Renderer-specific
 * recovery remains owned by RendererErrorBoundary closer to the canvas.
 */
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = this.retry.bind(this);
    this.reload = this.reload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.props.onError?.(error, info);
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  retry() {
    this.setState({ error: null });
  }

  reload() {
    if (typeof this.props.onReload === "function") {
      this.props.onReload();
      return;
    }
    globalThis.location?.reload?.();
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    if (typeof this.props.fallback === "function") {
      return this.props.fallback({
        error: this.state.error,
        retry: this.retry,
        reload: this.reload,
      });
    }
    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    const surfaceName = this.props.surfaceName ?? "Baryon";
    return (
      <main role="alert" style={APP_ERROR_ROOT_STYLE}>
        <p style={APP_ERROR_COPY_STYLE}>{surfaceName} stopped unexpectedly.</p>
        <div style={APP_ERROR_ACTIONS_STYLE}>
          <button type="button" onClick={this.retry}>
            Try again
          </button>
          <button type="button" onClick={this.reload}>
            Reload Baryon
          </button>
        </div>
      </main>
    );
  }
}
