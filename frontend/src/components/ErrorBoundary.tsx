import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="card py-10 text-center space-y-2">
          <div className="text-3xl">⚠️</div>
          <p className="text-red-400 font-medium">Something went wrong</p>
          <p className="text-xs text-gray-500">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn-secondary text-sm mt-2"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
