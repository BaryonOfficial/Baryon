import { Component } from "react";

/**
 * @extends {Component<{
 *   resetKey: string,
 *   onError?: (error: unknown) => void,
 *   children?: import("react").ReactNode,
 * }, { hasError: boolean }>}
 */
export class RendererErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    this.props.onError?.(error);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}
