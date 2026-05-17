'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProgressIndicator } from '@/components/progress-indicator';

const TAN = '#B4A689';
const INK_MUTED = '#5A5347';

export default function OnboardingStep2() {
  const router = useRouter();
  // CTA appears after the pitch text has had time to read (~3s).
  const [ctaVisible, setCtaVisible] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setCtaVisible(true), 3000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <main className="mx-auto flex h-[100svh] w-full max-w-md flex-col overflow-hidden px-6 pt-6">
      <header className="flex items-center">
        <Link
          href="/onboarding/1"
          aria-label="Back"
          className="text-[11px] uppercase tracking-widest text-ink-secondary transition-colors hover:text-ink-primary"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          back
        </Link>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-7 text-center">
        {/* Wordmark — bigger here because this is the brand intro screen */}
        <h1
          className="onboarding-fade-in italic leading-none text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 56,
            animationDelay: '0ms',
          }}
        >
          folks
        </h1>

        <p
          className="onboarding-fade-in italic leading-snug text-ink-primary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 19,
            maxWidth: 320,
            animationDelay: '400ms',
          }}
        >
          a journal that thinks in people, not days.
        </p>

        <p
          className="onboarding-fade-in italic leading-relaxed"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 14,
            color: INK_MUTED,
            maxWidth: 300,
            animationDelay: '900ms',
          }}
        >
          vent about the folks in your life. folks remembers who&apos;s who, sees
          the patterns, and gives you an honest read on each relationship.
        </p>

        {/* Element walkthrough row — small icons + labels for each surface */}
        <div
          className="onboarding-fade-in mt-2 grid grid-cols-4 items-start"
          style={{
            animationDelay: '1500ms',
            gap: 18,
            maxWidth: 320,
            width: '100%',
          }}
        >
          <TourTile label="vent">
            <MicGlyph />
          </TourTile>
          <TourTile label="folks">
            <PeopleGlyph />
          </TourTile>
          <TourTile label="journal">
            <BookGlyph />
          </TourTile>
          <TourTile label="patterns">
            <PatternGlyph />
          </TourTile>
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 pb-10">
        <button
          onClick={() => router.push('/onboarding/3')}
          disabled={!ctaVisible}
          className="text-[16px] text-accent-coral transition-opacity duration-400 disabled:opacity-0"
          style={{ fontFamily: 'var(--font-fraunces)' }}
          aria-hidden={!ctaVisible}
        >
          next →
        </button>
        <ProgressIndicator step={2} />
      </div>
    </main>
  );
}

function TourTile({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex items-center justify-center"
        style={{ height: 28 }}
      >
        {children}
      </div>
      <span
        className="italic"
        style={{
          fontFamily: 'var(--font-fraunces)',
          fontSize: 11,
          color: INK_MUTED,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function MicGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <rect x={10.2} y={7} width="1.6" height="8" rx="0.8" fill={TAN} />
      <rect x={10.2 - 4} y={5} width="1.6" height="12" rx="0.8" fill={TAN} />
      <rect x={10.2 + 4} y={5} width="1.6" height="12" rx="0.8" fill={TAN} />
      <rect x={10.2 + 8} y={7} width="1.6" height="8" rx="0.8" fill={TAN} />
    </svg>
  );
}

function PeopleGlyph() {
  return (
    <svg width="22" height="20" viewBox="0 0 22 20">
      <circle cx="7" cy="6" r="2.5" fill="none" stroke={TAN} strokeWidth="1.2" />
      <path
        d="M2 18 Q2 11 7 11 Q12 11 12 18"
        fill="none"
        stroke={TAN}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="15.5" cy="6.5" r="2.2" fill="none" stroke={TAN} strokeWidth="1.2" />
      <path
        d="M11 17 Q11 11.5 15.5 11.5 Q20 11.5 20 17"
        fill="none"
        stroke={TAN}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BookGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <line x1="11" y1="3" x2="11" y2="20" stroke={TAN} strokeWidth="1.2" />
      <path d="M11 3 Q4 3 2 6 L2 20 Q4 18 11 18 Z" fill="none" stroke={TAN} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M11 3 Q18 3 20 6 L20 20 Q18 18 11 18 Z" fill="none" stroke={TAN} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function PatternGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <polyline
        points="3,16 7,11 11,13 15,8 19,10"
        fill="none"
        stroke={TAN}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="3" cy="16" r="1.4" fill={TAN} />
      <circle cx="11" cy="13" r="1.4" fill={TAN} />
      <circle cx="19" cy="10" r="1.4" fill={TAN} />
    </svg>
  );
}
