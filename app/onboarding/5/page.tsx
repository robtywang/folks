'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProgressDots } from '@/components/onboarding/ProgressDots';
import { PillButton } from '@/components/onboarding/PillButton';

const PRIVACY_ITEMS = [
  'no email',
  'no phone',
  'no account',
  'no cloud backup',
];

export default function OnboardingStep5() {
  const router = useRouter();

  return (
    <main className="relative mx-auto flex h-[100svh] w-full max-w-md flex-col px-6 pt-6">
      <header className="flex items-center">
        <Link
          href="/onboarding/4"
          aria-label="Back"
          className="text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
        </Link>
      </header>

      <div className="mt-10 flex flex-1 flex-col">
        <h1
          className="italic text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 36,
            lineHeight: 1.1,
          }}
        >
          yours,
          <br />
          only.
        </h1>

        <ul className="mt-10 flex flex-col" style={{ gap: 16 }}>
          {PRIVACY_ITEMS.map((label) => (
            <li key={label} className="flex items-center gap-3">
              <i
                className="ti ti-x"
                style={{ fontSize: 16, color: 'var(--accent-coral)' }}
              />
              <span
                className="italic"
                style={{
                  fontFamily: 'var(--font-fraunces)',
                  fontSize: 17,
                  color: 'var(--ink-primary)',
                }}
              >
                {label}
              </span>
            </li>
          ))}
        </ul>

        <div
          className="mt-10 pt-5"
          style={{ borderTop: '0.5px solid var(--border-hair)' }}
        >
          <p
            className="italic"
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--ink-secondary)',
            }}
          >
            anthropic reads each entry to help you make sense of it — then
            deletes it. only your device keeps anything.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 pb-12">
        <ProgressDots active={5} />
        <PillButton onClick={() => router.push('/onboarding/6')}>
          next →
        </PillButton>
      </div>
    </main>
  );
}
