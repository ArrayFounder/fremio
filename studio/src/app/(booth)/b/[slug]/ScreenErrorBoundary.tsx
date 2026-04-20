"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  screenName: string;
  onReset?: () => void;
  accentColor?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ScreenErrorBoundary — Error boundary untuk setiap screen di Booth UI.
 * Menampilkan pesan error dalam Bahasa Indonesia dan tombol "Kembali ke Awal".
 */
export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[BoothUI] Error di layar "${this.props.screenName}":`, error, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const accent = this.props.accentColor ?? "#d4a017";

    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
        <div className="text-7xl">⚠️</div>
        <h2 className="text-3xl font-bold text-white">Ada yang Tidak Beres</h2>
        <p className="text-gray-300 text-lg max-w-sm">
          Layar <span className="font-semibold">{this.props.screenName}</span> mengalami
          masalah. Silakan coba lagi.
        </p>
        {process.env.NODE_ENV === "development" && this.state.error && (
          <pre className="text-xs text-red-300 bg-black/40 rounded p-3 max-w-sm overflow-auto">
            {this.state.error.message}
          </pre>
        )}
        {this.props.onReset && (
          <button
            onClick={this.handleReset}
            style={{ backgroundColor: accent }}
            className="mt-4 px-10 py-4 rounded-2xl text-xl font-bold text-white
                       active:opacity-80 transition-opacity select-none"
          >
            Kembali ke Awal
          </button>
        )}
      </div>
    );
  }
}
