'use client';

import { useEffect } from 'react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Caught by root error boundary:', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4">
      <div
        className="text-[11px] uppercase tracking-widest text-ink-secondary"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        something went wrong
      </div>
      <h1
        className="mt-2 text-center text-[20px] italic leading-snug text-ink-primary"
        style={{ fontFamily: 'var(--font-fraunces)' }}
      >
        the app hit an error and couldn't recover
      </h1>
      <button
        onClick={reset}
        className="mt-6 text-[11px] uppercase tracking-widest text-accent-coral"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        try again →
      </button>
    </main>
  );
}
