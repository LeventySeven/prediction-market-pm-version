'use client';

import React from "react";

type ClientErrorBoundaryProps = {
  children: React.ReactNode;
  onReset?: () => void;
  lang?: "RU" | "EN";
};

type ClientErrorBoundaryState = {
  hasError: boolean;
};

class ClientErrorBoundary extends React.Component<
  ClientErrorBoundaryProps,
  ClientErrorBoundaryState
> {
  state: ClientErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ClientErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Client shell crashed", error);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const lang = this.props.lang ?? "EN";
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-3xl border border-zinc-900 bg-zinc-950/70 p-6 text-center">
          <div className="text-lg font-semibold text-zinc-100">
            {lang === "RU" ? "Экран временно недоступен" : "This screen is temporarily unavailable"}
          </div>
          <p className="mt-3 text-sm text-zinc-400">
            {lang === "RU"
              ? "Интерфейс восстановится после повторной загрузки данных."
              : "The interface should recover after reloading the current data."}
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="h-11 rounded-full bg-[rgba(245,68,166,1)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[rgba(245,68,166,0.9)]"
            >
              {lang === "RU" ? "Повторить" : "Retry"}
            </button>
            <a
              href="/catalog"
              className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-800 px-4 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-900/60"
            >
              {lang === "RU" ? "Вернуться в каталог" : "Return to catalog"}
            </a>
          </div>
        </div>
      </div>
    );
  }
}

export default ClientErrorBoundary;
