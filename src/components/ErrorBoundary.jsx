import React, { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    // You can also log the error to an error reporting service
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can customize the fallback UI
      return (
        <div className="p-6 bg-red-50 text-red-700">
          <h2 className="text-xl font-bold mb-4">Ocorreu um erro inesperado.</h2>
          <p className="mb-4">
            {this.state.error?.toString() ?? 'Erro desconhecido'}
          </p>
          <details className="mb-4 space-y-2">
            <summary className="font-medium">Detalhes do erro</summary>
            <pre className="bg-gray-50 p-4 rounded">{this.state.errorInfo?.componentStack ?? ''}</pre>
          </details>
          <button className="btn-primary mt-4" onClick={() => window.location.reload()}>
            Recarregar página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
