import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env.DEV) {
      // Solo en desarrollo para diagnóstico.
      console.error('RouteErrorBoundary', error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="mf-page">
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-[20px] border border-red-500/30 bg-red-500/10 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/15 text-red-400">
            <AlertTriangle size={28} />
          </div>
          <h2 className="text-xl font-semibold text-[var(--mf-text)]">Ocurrió un error en esta vista</h2>
          <p className="max-w-[520px] text-sm text-[var(--mf-text-2)]">
            La página no pudo renderizarse correctamente. Puedes reintentar sin perder tu sesión.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-4 py-2 text-sm font-semibold text-[var(--mf-accent)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_70%,white_12%)]"
          >
            <RefreshCw size={16} />
            Reintentar
          </button>
        </div>
      </div>
    );
  }
}
