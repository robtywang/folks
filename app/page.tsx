'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import { db, getMeta, setMeta } from '@/lib/db';
import { pruneAllOrphans } from '@/lib/save-entry';
import { recomputeAll } from '@/lib/closeness';
import { expireOldPrompts } from '@/lib/prompts';
import { hasLockPin } from '@/lib/lock';
import { ALL_PROMPTS } from '@/lib/session-prompts';
import type { Person } from '@/types';

const LEGACY_ONBOARDED_KEY = 'folks_onboarded';
const STEP4_SESSION_KEY = 'folks_onboarding_step_4';

function formatDate(): string {
  const d = new Date();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
  return `${weekday} · ${monthDay}`;
}

function timeAgo(ts: number): string {
  const hours = (Date.now() - ts) / 3_600_000;
  if (hours < 1) return 'NOW';
  if (hours < 24) return `${Math.floor(hours)}H`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}D`;
  return `${Math.floor(days / 7)}W`;
}

interface RecentPersonRow {
  person: Person;
  lastEntryAt: number;
}

export default function Home() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [draft, setDraft] = useState('');

  // Cycling placeholder: rotates through ALL_PROMPTS, evening-biased. The
  // visible prompt swaps every 4 seconds with a fade between, and the
  // currently-visible prompt also gently pulses opacity for a soft "blink"
  // effect. Picked starting index once on mount so different sessions begin
  // at different points in the cycle.
  const prompts = useMemo<readonly string[]>(() => {
    const hour = new Date().getHours();
    const evening = hour >= 18 || hour < 6;
    if (evening) {
      const eveningIdx = [1, 5, 7];
      return eveningIdx.map((i) => ALL_PROMPTS[i]!);
    }
    return ALL_PROMPTS;
  }, []);
  const [promptIdx, setPromptIdx] = useState(() =>
    Math.floor(Math.random() * prompts.length)
  );
  useEffect(() => {
    const id = setInterval(() => {
      setPromptIdx((i) => (i + 1) % prompts.length);
    }, 4000);
    return () => clearInterval(id);
  }, [prompts.length]);
  const placeholder = prompts[promptIdx]!;

  // 3 most-recently-active people (grouped, sorted by their newest entry).
  const recentPeople =
    useLiveQuery(async () => {
      const entries = await db.entries
        .orderBy('createdAt')
        .reverse()
        .toArray();
      const seen = new Map<string, RecentPersonRow>();
      for (const e of entries) {
        if (!e.personId || seen.has(e.personId)) continue;
        const person = await db.people.get(e.personId);
        if (!person) continue;
        seen.set(e.personId, { person, lastEntryAt: e.createdAt });
        if (seen.size >= 3) break;
      }
      return Array.from(seen.values());
    }, []) ?? [];

  useEffect(() => {
    (async () => {
      let completed = await getMeta<boolean>('hasCompletedOnboarding');
      if (!completed) {
        try {
          if (localStorage.getItem(LEGACY_ONBOARDED_KEY) === 'true') {
            await setMeta('hasCompletedOnboarding', true);
            completed = true;
          }
        } catch {}
      }
      const inStep4 =
        typeof window !== 'undefined' &&
        sessionStorage.getItem(STEP4_SESSION_KEY) === 'true';
      const hasPin = hasLockPin();
      if (!hasPin && !completed && !inStep4) {
        router.replace('/onboarding/1');
        return;
      }
      setChecked(true);
      pruneAllOrphans().catch(console.error);
      recomputeAll().catch(console.error);
      expireOldPrompts().catch(console.error);
    })();
  }, [router]);

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && draft.trim()) {
      e.preventDefault();
      router.push(`/chat?seed=${encodeURIComponent(draft.trim())}`);
    }
  }

  function handleMicTap() {
    // Voice mode wired in a follow-up — Web Speech API into `draft`. No-op for now.
  }

  function handlePersonTap(name: string) {
    console.log('open profile', name);
  }

  if (!checked) {
    return (
      <main
        className="mx-auto h-[100svh] w-full"
        style={{ background: '#FAF7F0', maxWidth: 360 }}
      />
    );
  }

  const showRecent = draft.length === 0;

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="relative mx-auto h-[100svh] w-full overflow-hidden"
      style={{ background: '#FAF7F0', maxWidth: 360 }}
    >
      {/* Top chrome — "folks" wordmark sits high, small */}
      <div
        className="absolute inset-x-0 text-center italic"
        style={{
          top: 58,
          fontFamily: 'Georgia, serif',
          fontSize: 14,
          lineHeight: 1,
          color: '#1F1A14',
        }}
      >
        folks
      </div>

      {/* Date hero — the big centerpiece */}
      <div
        className="absolute inset-x-0 text-center italic"
        style={{
          top: 168,
          fontFamily: 'Georgia, serif',
          fontSize: 30,
          fontWeight: 500,
          lineHeight: 1.1,
          color: '#1F1A14',
          letterSpacing: '-0.005em',
        }}
      >
        {formatDate()}
      </div>

      {/* Notebook icon → /journal (top-right, pinned high) */}
      <button
        onClick={() => router.push('/journal')}
        aria-label="Open journal"
        className="absolute"
        style={{ left: 312, top: 54, width: 14, height: 18 }}
      >
        <svg width="14" height="18" viewBox="0 0 14 18">
          <rect
            x="0.6"
            y="0.6"
            width="12.8"
            height="16.8"
            rx="1.5"
            ry="1.5"
            fill="none"
            stroke="#B4A689"
            strokeWidth="1.2"
          />
          <line
            x1="3"
            y1="0.6"
            x2="3"
            y2="17.4"
            stroke="#B4A689"
            strokeWidth="1.2"
          />
          <line x1="5.5" y1="6" x2="11" y2="6" stroke="#B4A689" strokeWidth="0.8" />
          <line x1="5.5" y1="9" x2="11" y2="9" stroke="#B4A689" strokeWidth="0.8" />
          <line x1="5.5" y1="12" x2="9.5" y2="12" stroke="#B4A689" strokeWidth="0.8" />
        </svg>
      </button>

      {/* Writing area — sits below the date hero */}
      <div className="absolute" style={{ left: 24, right: 24, top: 296 }}>
        <div style={{ position: 'relative', height: 24 }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleInputKeyDown}
            autoFocus
            className="italic"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'Georgia, serif',
              fontSize: 16,
              color: '#1F1A14',
              caretColor: '#1F1A14',
              padding: 0,
              paddingRight: 36, // clear of mic
              lineHeight: '24px',
            }}
          />
          {!draft && (
            <AnimatePresence mode="wait">
              <motion.span
                key={placeholder}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.85, 0.6, 0.85, 0.6] }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 4,
                  times: [0, 0.1, 0.4, 0.7, 1],
                  ease: 'easeInOut',
                }}
                className="italic pointer-events-none"
                style={{
                  position: 'absolute',
                  left: 8,
                  top: 0,
                  fontFamily: 'Georgia, serif',
                  fontSize: 16,
                  color: '#B4A689',
                  lineHeight: '24px',
                  whiteSpace: 'nowrap',
                }}
              >
                {placeholder}
              </motion.span>
            </AnimatePresence>
          )}
        </div>

        {/* 4-bar mic icon — only when input is empty */}
        {!draft && (
          <button
            onClick={handleMicTap}
            aria-label="Voice"
            className="absolute"
            style={{ right: 0, top: -1, width: 24, height: 24 }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24">
              <rect x={11.2} y={9} width="1.6" height="6" rx="0.8" fill="#B4A689" />
              <rect x={11.2 - 4} y={7} width="1.6" height="10" rx="0.8" fill="#B4A689" />
              <rect x={11.2 + 4} y={7} width="1.6" height="10" rx="0.8" fill="#B4A689" />
              <rect x={11.2 + 8} y={9} width="1.6" height="6" rx="0.8" fill="#B4A689" />
            </svg>
          </button>
        )}

        {/* Hairline under writing line */}
        <div
          style={{
            marginTop: 14,
            height: 0.7,
            background: '#B4A689',
            opacity: 0.55,
          }}
        />
      </div>

      {/* RECENT section — fades out while a draft is being typed */}
      <AnimatePresence initial={false}>
        {showRecent && (
          <motion.div
            key="recent"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: showRecent ? 'easeIn' : 'easeOut' }}
            className="absolute"
            style={{ left: 24, right: 24, top: 478 }}
          >
            <div className="flex items-center gap-3">
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: '#B4A689',
                }}
              >
                RECENT
              </span>
              <div
                className="flex-1"
                style={{ height: 0.7, background: '#B4A689', opacity: 0.55 }}
              />
            </div>

            <div className="mt-4">
              {recentPeople.map((row) => (
                <button
                  key={row.person.id}
                  onClick={() => handlePersonTap(row.person.name)}
                  className="block w-full text-left"
                  style={{ paddingTop: 12, paddingBottom: 12 }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="italic"
                      style={{
                        fontFamily: 'Georgia, serif',
                        fontSize: 17,
                        fontWeight: 500,
                        color: '#1F1A14',
                      }}
                    >
                      {row.person.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <svg width="7" height="9" viewBox="0 0 7 9" aria-hidden="true">
                        <rect
                          x="0.6"
                          y="3.6"
                          width="5.8"
                          height="4.8"
                          rx="0.8"
                          fill="none"
                          stroke="#B4A689"
                          strokeWidth="0.8"
                        />
                        <path
                          d="M2 3.5 V2.2 a1.5 1.5 0 0 1 3 0 V3.5"
                          fill="none"
                          stroke="#B4A689"
                          strokeWidth="0.8"
                        />
                      </svg>
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 10,
                          color: '#B4A689',
                        }}
                      >
                        {timeAgo(row.lastEntryAt)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-col gap-1.5">
                    <div
                      style={{
                        height: 5,
                        width: 285,
                        borderRadius: 2.5,
                        background: '#D9CFBC',
                        opacity: 0.7,
                      }}
                    />
                    <div
                      style={{
                        height: 5,
                        width: 190,
                        borderRadius: 2.5,
                        background: '#D9CFBC',
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: 12,
                      height: 0.7,
                      background: '#B4A689',
                      opacity: 0.55,
                    }}
                  />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.main>
  );
}
