import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';

interface State { error: Error | null }

/** Last line of defence — render errors never produce a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo): void { console.error('Render error', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
        <div className="card p-8 max-w-md text-center">
          <span className="mx-auto h-12 w-12 rounded-md bg-danger-50 text-danger-600 flex items-center justify-center mb-3"><AlertTriangle className="h-6 w-6" /></span>
          <h1 className="text-heading">Something went wrong</h1>
          <p className="text-sm text-neutral-500 mt-2 break-words">{this.state.error.message}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" onClick={() => this.setState({ error: null })}>Try again</Button>
            <Button onClick={() => window.location.reload()}>Reload app</Button>
          </div>
        </div>
      </div>
    );
  }
}
