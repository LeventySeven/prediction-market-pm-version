'use client';

import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("App route error boundary caught an exception", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white">
        <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
            Application Error
          </p>
          <h1 className="mt-4 text-2xl font-semibold text-zinc-100">
            Something went wrong while loading the market app.
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            The client hit an unexpected state. Reload the catalog or retry the current view.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-full border border-zinc-800 bg-zinc-950 px-5 py-3 text-sm font-semibold text-zinc-100 transition-colors hover:bg-zinc-900"
            >
              Retry
            </button>
            <a
              href="/catalog"
              className="rounded-full border border-zinc-800 px-5 py-3 text-sm font-semibold text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
            >
              Go to catalog
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
