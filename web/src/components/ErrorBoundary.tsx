import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Without this, any uncaught render error unmounts the whole tree to a
// blank page with nothing in the UI to explain why.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Frames crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, maxWidth: 560, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something broke</h1>
          <p className="muted" style={{ marginBottom: 16 }}>
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <button className="btn btn-accent" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
