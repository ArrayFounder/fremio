import React from 'react';

// Send error report to backend silently (best-effort, non-blocking)
function reportClientError(error, errorInfo) {
  try {
    const payload = JSON.stringify({
      message: error?.message || String(error),
      stack: error?.stack || '',
      componentStack: errorInfo?.componentStack || '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      url: typeof window !== 'undefined' ? window.location.href : '',
      timestamp: new Date().toISOString(),
    });
    const url = '/api/client-error';
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(url, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' } })
        .catch(() => {});
    }
  } catch (_) {
    // Never let the reporter itself crash
  }
}

class ErrorBoundary extends React.Component {
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
    
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Report to backend regardless of environment
    reportClientError(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          background: 'linear-gradient(to bottom, #fdf7f4, white)',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            maxWidth: '500px',
            textAlign: 'center',
            padding: '40px',
            background: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>😵</div>
            <h1 style={{ 
              fontSize: '24px', 
              fontWeight: 'bold', 
              color: '#1e293b',
              marginBottom: '12px'
            }}>
              Oops! Terjadi Kesalahan
            </h1>
            <p style={{ 
              color: '#64748b', 
              marginBottom: '24px',
              lineHeight: 1.6
            }}>
              Maaf, terjadi kesalahan yang tidak terduga. 
              Silakan coba muat ulang halaman atau kembali ke beranda.
            </p>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '12px 24px',
                  background: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Muat Ulang
              </button>
              <button
                onClick={() => window.location.href = '/'}
                style={{
                  padding: '12px 24px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Ke Beranda
              </button>
            </div>

            {/* Always show error details so users can screenshot and report */}
            {this.state.error && (
              <details style={{ 
                marginTop: '24px', 
                textAlign: 'left',
                padding: '16px',
                background: '#fef2f2',
                borderRadius: '8px',
                fontSize: '11px'
              }}>
                <summary style={{ 
                  cursor: 'pointer', 
                  fontWeight: '600',
                  color: '#dc2626',
                  marginBottom: '8px'
                }}>
                  Detail Error (screenshot &amp; kirim ke tim)
                </summary>
                <pre style={{ 
                  overflow: 'auto', 
                  whiteSpace: 'pre-wrap',
                  color: '#7f1d1d',
                  maxHeight: '200px',
                  fontSize: '10px',
                }}>
                  {this.state.error.toString()}
                  {'\n\nURL: '}{typeof window !== 'undefined' ? window.location.href : ''}
                  {'\nUA: '}{typeof navigator !== 'undefined' ? navigator.userAgent : ''}
                  {'\n\nComponent Stack:'}{this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
