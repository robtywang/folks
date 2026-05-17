'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
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
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const USER_NAME_KEY = 'folks_user_name';

const CORAL = '#C8553D';
const INK = '#1F1A14';
const TAN = '#B4A689';

/** Wrap known person first-names in coral spans for inline highlighting. */
function highlightNames(text: string, people: Person[]): React.ReactNode[] {
  if (!text) return [];
  if (people.length === 0) return [text];
  const tokens = people
    .map((p) => p.name.trim().split(/\s+/)[0])
    .filter((t): t is string => !!t && t.length > 1)
    .sort((a, b) => b.length - a.length);
  if (tokens.length === 0) return [text];
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b(${tokens.map(escape).join('|')})\\b`, 'gi');
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={key++} style={{ color: CORAL }}>
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Home() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [draft, setDraft] = useState('');
  const [userName, setUserName] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_NAME_KEY);
      if (stored && stored.trim()) setUserName(stored.trim());
    } catch {}
  }, []);

  // Known people for inline coral name-highlighting.
  const allPeople =
    useLiveQuery(async () => {
      const arr = await db.people.toArray();
      return arr;
    }, []) ?? [];

  // Cycling typewriter placeholder.
  const prompts = useMemo<readonly string[]>(() => {
    const hour = new Date().getHours();
    const evening = hour >= 18 || hour < 6;
    if (evening) return [1, 5, 7].map((i) => ALL_PROMPTS[i]!);
    return ALL_PROMPTS;
  }, []);
  const [promptIdx, setPromptIdx] = useState(() =>
    Math.floor(Math.random() * prompts.length)
  );
  const [typedCount, setTypedCount] = useState(0);
  const [typePhase, setTypePhase] = useState<'typing' | 'erasing'>('typing');
  const currentPrompt = prompts[promptIdx]!;
  useEffect(() => {
    let cancelled = false;
    const TYPE_MS = 70;
    const ERASE_MS = 30;
    const HOLD_MS = 1800;
    if (typePhase === 'typing') {
      if (typedCount < currentPrompt.length) {
        const t = setTimeout(() => !cancelled && setTypedCount((c) => c + 1), TYPE_MS);
        return () => {
          cancelled = true;
          clearTimeout(t);
        };
      }
      const t = setTimeout(() => !cancelled && setTypePhase('erasing'), HOLD_MS);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
    if (typedCount > 0) {
      const t = setTimeout(() => !cancelled && setTypedCount((c) => c - 1), ERASE_MS);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
    setPromptIdx((i) => (i + 1) % prompts.length);
    setTypePhase('typing');
    return () => {
      cancelled = true;
    };
  }, [typePhase, typedCount, currentPrompt, prompts.length]);
  const placeholder = currentPrompt.slice(0, typedCount);

  // Onboarding gate + boot.
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

  // Auto-grow textarea so the box extends downward as text wraps.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 24)}px`;
  }, [draft]);

  function sendDraft() {
    const text = draft.trim();
    if (!text) return;
    router.push(`/chat?seed=${encodeURIComponent(text)}`);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && draft.trim()) {
      e.preventDefault();
      sendDraft();
    }
  }

  // Voice = enter the chat in voice mode. No local recording on home; the
  // chat owns the entire conversation surface including audio.
  function enterVoiceMode() {
    router.push('/chat?mode=voice');
  }

  if (!checked) {
    return <main className="h-full w-full" />;
  }

  const hasText = draft.trim().length > 0;
  const highlightedParts = highlightNames(draft, allPeople);

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="relative h-full w-full overflow-hidden"
    >
      {/* Wordmark — bigger, hugs the Dynamic Island */}
      <div
        className="absolute inset-x-0 text-center italic"
        style={{
          top: 8,
          fontFamily: 'Georgia, serif',
          fontSize: 24,
          fontWeight: 500,
          lineHeight: 1,
          color: INK,
        }}
      >
        folks
      </div>

      {/* Journal — small notebook icon top-right */}
      <button
        onClick={() => router.push('/journal')}
        aria-label="Open journal"
        className="absolute"
        style={{
          right: 18,
          top: 12,
          width: 16,
          height: 20,
          background: 'transparent',
          border: 'none',
          padding: 0,
        }}
      >
        <svg width="16" height="20" viewBox="0 0 16 20">
          <rect
            x="0.7"
            y="0.7"
            width="14.6"
            height="18.6"
            rx="1.5"
            ry="1.5"
            fill="none"
            stroke={TAN}
            strokeWidth="1.2"
          />
          <line x1="3.6" y1="0.7" x2="3.6" y2="19.3" stroke={TAN} strokeWidth="1.2" />
          <line x1="6" y1="5.5" x2="13" y2="5.5" stroke={TAN} strokeWidth="0.9" />
          <line x1="6" y1="8.5" x2="13" y2="8.5" stroke={TAN} strokeWidth="0.9" />
          <line x1="6" y1="11.5" x2="11" y2="11.5" stroke={TAN} strokeWidth="0.9" />
        </svg>
      </button>

      {/* Greeting — pulled from settings. Falls back to no greeting line if
          the user hasn't set a name yet. */}
      {userName && (
        <div
          className="absolute inset-x-0 text-center italic"
          style={{
            top: 116,
            fontFamily: 'Georgia, serif',
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 1.2,
            color: '#5A5347',
          }}
        >
          Hi, {userName}
        </div>
      )}

      {/* Date hero — the visual centerpiece. Full date with year. */}
      <div
        className="absolute inset-x-0 text-center italic"
        style={{
          top: userName ? 146 : 156,
          fontFamily: 'Georgia, serif',
          fontSize: 26,
          fontWeight: 500,
          lineHeight: 1.2,
          color: INK,
          letterSpacing: '-0.005em',
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        {formatDate()}
      </div>

      {/* Writing area */}
      <div className="absolute" style={{ left: 16, right: 16, top: 290 }}>
        {/* The textarea and a name-highlight overlay layered together. The
            textarea carries the caret + handles input; the overlay renders
            the same text with known names wrapped in coral. Both share
            identical typography so the layers align exactly. */}
        <div style={{ position: 'relative', minHeight: 24 }}>
          <div
            aria-hidden="true"
            className="italic"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              fontFamily: 'Georgia, serif',
              fontSize: 16,
              color: INK,
              padding: 0,
              lineHeight: '24px',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
            }}
          >
            {draft ? highlightedParts : <>&#8203;</>}
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleInputKeyDown}
            autoFocus
            rows={1}
            className="italic"
            style={{
              position: 'relative',
              display: 'block',
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
              fontFamily: 'Georgia, serif',
              fontSize: 16,
              // text is fully transparent so only the overlay's coloring shows,
              // but the native blinking caret stays visible via caretColor.
              color: 'transparent',
              caretColor: INK,
              padding: 0,
              lineHeight: '24px',
              WebkitTextFillColor: 'transparent',
            }}
          />
          {!draft && (
            <span
              className="italic pointer-events-none"
              style={{
                position: 'absolute',
                left: 1,
                top: 0,
                fontFamily: 'Georgia, serif',
                fontSize: 16,
                color: TAN,
                lineHeight: '24px',
                whiteSpace: 'nowrap',
              }}
            >
              {placeholder}
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 1.5,
                  height: '0.9em',
                  background: TAN,
                  verticalAlign: 'middle',
                  marginLeft: 1,
                  animation: 'blink-caret 1.05s steps(1) infinite',
                }}
              />
            </span>
          )}
        </div>

        {/* Hairline directly under the writing line — narrower than the
            writing area so it reads as an accent underline, not a divider. */}
        <div
          style={{
            marginTop: 12,
            marginLeft: 'auto',
            marginRight: 'auto',
            width: '80%',
            height: 0.7,
            background: TAN,
            opacity: 0.55,
          }}
        />

        {/* Action row — mic = navigate to /chat in voice mode. Send appears
            once there's typed text and navigates to /chat with the seed. */}
        <div
          className="mt-4 flex items-center justify-end"
          style={{ gap: 18 }}
        >
          <button
            onClick={enterVoiceMode}
            aria-label="Start voice conversation"
            style={{
              width: 24,
              height: 24,
              background: 'transparent',
              border: 'none',
              padding: 0,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24">
              <rect x={11.2} y={9} width="1.6" height="6" rx="0.8" fill={TAN} />
              <rect x={11.2 - 4} y={7} width="1.6" height="10" rx="0.8" fill={TAN} />
              <rect x={11.2 + 4} y={7} width="1.6" height="10" rx="0.8" fill={TAN} />
              <rect x={11.2 + 8} y={9} width="1.6" height="6" rx="0.8" fill={TAN} />
            </svg>
          </button>
          {hasText && (
            <button
              onClick={() => sendDraft()}
              className="text-[11px] uppercase tracking-widest"
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 500,
                color: CORAL,
                background: 'transparent',
                border: 'none',
                letterSpacing: '0.12em',
              }}
            >
              send →
            </button>
          )}
        </div>
      </div>
    </motion.main>
  );
}
