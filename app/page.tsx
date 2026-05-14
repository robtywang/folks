'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ComposeCard } from '@/components/compose-card';
import { LockedRecent } from '@/components/locked-recent';
import { pruneAllOrphans } from '@/lib/save-entry';
import { recomputeAll } from '@/lib/closeness';
import { useLockState, hasLockPin } from '@/lib/lock';
import { getMeta, setMeta } from '@/lib/db';
import type { SaveResult } from '@/lib/save-entry';

// Legacy localStorage key from v0 onboarding — we migrate it into Dexie meta
// on first boot so existing users don't get re-onboarded.
const LEGACY_ONBOARDED_KEY = 'folks_onboarded';
const STEP4_SESSION_KEY = 'folks_onboarding_step_4';
const SILENT_NUDGE_DELAY_MS = 90_000;
const FIRST_FOLK_MESSAGE_MS = 4_000;

function formatDate(): string {
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function Home() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const { pinSet, locked } = useLockState();

  // Step-4 state — only active when user arrives here from /onboarding/3.
  const [step4Active, setStep4Active] = useState(false);
  const [hasInteractedStep4, setHasInteractedStep4] = useState(false);
  const [interactionCounter, setInteractionCounter] = useState(0);
  const [showSilentNudge, setShowSilentNudge] = useState(false);
  const [firstFolkMessage, setFirstFolkMessage] = useState<{
    personId: string;
    fading: boolean;
  } | null>(null);

  // Boot: gate onboarding by passcode presence. If the user has a passcode set,
  // they're a returning user and skip onboarding. The legacy completed-flag
  // migration is still applied so existing users with no passcode but who
  // already finished onboarding aren't re-prompted.
  useEffect(() => {
    (async () => {
      let completed = await getMeta<boolean>('hasCompletedOnboarding');
      if (!completed) {
        try {
          const legacy = localStorage.getItem(LEGACY_ONBOARDED_KEY);
          if (legacy === 'true') {
            await setMeta('hasCompletedOnboarding', true);
            completed = true;
          }
        } catch {}
      }

      const inStep4 =
        typeof window !== 'undefined' &&
        sessionStorage.getItem(STEP4_SESSION_KEY) === 'true';

      const hasPin = hasLockPin();
      // Onboarding only fires for true first-timers: no passcode set AND
      // no prior completion marker AND not already in the post-onboarding flow.
      if (!hasPin && !completed && !inStep4) {
        router.replace('/onboarding/1');
        return;
      }

      setStep4Active(inStep4);
      setChecked(true);

      pruneAllOrphans().catch(console.error);
      recomputeAll().catch(console.error);
    })();
  }, [router]);

  // 90-second silent nudge timer. Resets on any interaction.
  useEffect(() => {
    if (!step4Active || hasInteractedStep4) return;
    const t = window.setTimeout(
      () => setShowSilentNudge(true),
      SILENT_NUDGE_DELAY_MS
    );
    return () => window.clearTimeout(t);
  }, [step4Active, hasInteractedStep4, interactionCounter]);

  function handleStep4Interaction() {
    setHasInteractedStep4(true);
    setShowSilentNudge(false);
    setInteractionCounter((c) => c + 1);
  }

  async function handleFirstFolk(result: SaveResult) {
    if (!step4Active) return;
    // Only trigger when an entry was actually attributed to a person.
    if (!result.entry.personId || !result.attributedTo) return;

    setFirstFolkMessage({ personId: result.entry.personId, fading: false });

    // Mark complete immediately so refresh / navigation won't redirect to
    // onboarding. Visual fade-out is a separate concern below.
    try {
      sessionStorage.removeItem(STEP4_SESSION_KEY);
      await setMeta('hasCompletedOnboarding', true);
    } catch {}

    // Auto-fade after 4s, then clean up step 4 state entirely.
    window.setTimeout(() => {
      setFirstFolkMessage((m) => (m ? { ...m, fading: true } : null));
      window.setTimeout(() => {
        setFirstFolkMessage(null);
        setStep4Active(false);
      }, 400);
    }, FIRST_FOLK_MESSAGE_MS);
  }

  if (!checked) {
    return <main className="mx-auto min-h-screen w-full max-w-md" />;
  }

  // Home is intentionally never lock-gated — compose stays open so capture
  // is always one tap away. Locked surfaces (journal, ratings, profile)
  // each prompt for the passcode on entry per the unlock-mode setting.

  const showMicPulse = step4Active && !hasInteractedStep4;

  return (
    <main className="relative mx-auto min-h-screen w-full max-w-md px-4 pb-12 pt-6">
      {/* Top bar */}
      <header className="grid grid-cols-3 items-center text-ink-secondary">
        <div className="justify-self-start">
          <Link
            href="/ratings"
            aria-label="Open ratings"
            className="transition-colors hover:text-ink-primary"
          >
            <i className="ti ti-chart-bar" style={{ fontSize: 18 }} />
          </Link>
        </div>
        <span
          className="justify-self-center text-[15px] italic text-ink-primary"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          folks
        </span>
        <div className="flex items-center gap-4 justify-self-end">
          <Link
            href="/journal"
            aria-label="Open journal"
            className="relative transition-colors hover:text-ink-primary"
          >
            <i className="ti ti-book" style={{ fontSize: 18 }} />
            {pinSet && (
              <span
                className="absolute -right-1.5 -top-1.5 flex h-2.5 w-2.5 items-center justify-center rounded-full"
                style={{
                  background: locked
                    ? 'var(--accent-coral)'
                    : 'var(--accent-sage)',
                  border: '1px solid var(--bg-cream)',
                }}
                aria-label={locked ? 'locked' : 'unlocked'}
                title={locked ? 'locked' : 'unlocked for this session'}
              />
            )}
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            className="transition-colors hover:text-ink-primary"
          >
            <i className="ti ti-settings" style={{ fontSize: 18 }} />
          </Link>
        </div>
      </header>

      {/* Date display */}
      <div className="mt-10 text-center">
        <div
          className="text-[11px] uppercase tracking-widest text-ink-secondary"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          today
        </div>
        <h1
          className="mt-2 text-[28px] italic leading-tight text-ink-primary"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          {formatDate()}
        </h1>
      </div>

      {/* Compose card */}
      <div className="mt-8">
        <ComposeCard
          micPulse={showMicPulse}
          onInteraction={step4Active ? handleStep4Interaction : undefined}
          onSaveComplete={step4Active ? handleFirstFolk : undefined}
        />
      </div>

      {/* Step-4 prompts */}
      {step4Active && (
        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <p
            className="text-[14px] italic leading-snug"
            style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
          >
            start anywhere. one sentence is enough.
          </p>
          {showSilentNudge && (
            <p
              className="onboarding-fade-in text-[13px] italic leading-snug"
              style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
            >
              no pressure. you can come back later.
            </p>
          )}
        </div>
      )}

      {/* Locked previews */}
      <LockedRecent />

      {/* First-folk slide-up message */}
      {firstFolkMessage && (
        <Link
          href={`/person/${firstFolkMessage.personId}`}
          onClick={() => setFirstFolkMessage((m) => (m ? { ...m, fading: true } : null))}
          className={`fixed bottom-20 left-1/2 -translate-x-1/2 ${
            firstFolkMessage.fading ? 'folk-fade-out' : 'folk-slide-up'
          }`}
          style={{ zIndex: 50 }}
        >
          <p
            className="rounded-full px-4 py-2 text-[14px] italic"
            style={{
              fontFamily: 'var(--font-fraunces)',
              color: '#8C7E5C',
              background: 'var(--bg-cream)',
              border: '0.5px solid var(--border-hair)',
              boxShadow: '0 8px 24px rgba(31,26,20,0.08)',
            }}
          >
            your first folk. tap to see them.
          </p>
        </Link>
      )}
    </main>
  );
}
