import { Component, type ErrorInfo, type ReactNode } from "react";

export interface IReactErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  label?: string
}

interface IReactErrorBoundaryState {
  hasError: boolean
}

export default class ReactErrorBoundary extends Component<IReactErrorBoundaryProps, IReactErrorBoundaryState> {
  state: IReactErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): IReactErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(this.props.label ?? "React component failed:", error, info.componentStack)
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null
    return this.props.children
  }
}
