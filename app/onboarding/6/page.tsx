'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProgressDots } from '@/components/onboarding/ProgressDots';
import { PillButton } from '@/components/onboarding/PillButton';

const USER_NAME_KEY = 'folks_user_name';

export default function OnboardingStep6() {
  const router = useRouter();
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Don't auto-focus on mount — keyboard popping immediately is jarring.
  // Users tap the input themselves when they're ready.

  function handleAdvance() {
    const trimmed = name.trim();
    try {
      if (trimmed) {
        localStorage.setItem(USER_NAME_KEY, trimmed);
      } else {
        // Empty input → clear any prior value (no greeting on home).
        localStorage.removeItem(USER_NAME_KEY);
      }
    } catch {}
    router.push('/onboarding/7');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdvance();
    }
  }

  return (
    <main className="relative mx-auto flex h-[100svh] w-full max-w-md flex-col px-6 pt-6">
      <header className="flex items-center">
        <Link
          href="/onboarding/5"
          aria-label="Back"
          className="text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
        </Link>
      </header>

      <div className="mt-12 flex flex-1 flex-col">
        <span
          className="uppercase"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.18em',
            color: 'var(--ink-secondary)',
          }}
        >
          one more thing
        </span>
        <h1
          className="mt-3 italic text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 28,
            lineHeight: 1.2,
            maxWidth: 320,
          }}
        >
          what should we call you?
        </h1>
        <p
          className="mt-3 italic"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 14,
            lineHeight: 1.45,
            color: 'var(--ink-secondary)',
            maxWidth: 320,
          }}
        >
          just for the greeting. you can change it later in settings.
        </p>

        {/* Name input — italic, underline-only, matches the journal entry
            input pattern. */}
        <div className="mt-10">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="your name"
            autoComplete="given-name"
            autoCorrect="off"
            spellCheck={false}
            className="italic"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              borderBottom: '0.5px solid var(--border-hair)',
              fontFamily: 'var(--font-fraunces)',
              fontSize: 22,
              color: 'var(--ink-primary)',
              caretColor: 'var(--ink-primary)',
              padding: '8px 0',
            }}
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 pb-12">
        <ProgressDots active={6} />
        <PillButton onClick={handleAdvance}>
          {name.trim() ? 'next →' : 'skip →'}
        </PillButton>
      </div>
    </main>
  );
}
