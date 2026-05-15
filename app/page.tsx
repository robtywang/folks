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
  const d = new Date();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
  return `${weekday} · ${monthDay}`;
}

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
  const [voiceInterim, setVoiceInterim] = useState('');
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  }, [draft, voiceInterim]);

  function sendDraft() {
    const text = draft.trim();
    if (!text) return;
    if (recording) stopVoice();
    router.push(`/chat?seed=${encodeURIComponent(text)}`);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && draft.trim()) {
      e.preventDefault();
      sendDraft();
    }
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setRecording(false);
    setVoiceInterim('');
  }

  function startVoice() {
    if (typeof window === 'undefined') return;
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => unknown)
      | undefined;
    if (!SR) {
      alert('voice input is not supported in this browser. try chrome or safari.');
      return;
    }
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SR() as any;
    recognition.continuous = !isIOS;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let baseText = draft ? draft + (draft.endsWith(' ') ? '' : ' ') : '';
    let userStopped = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalChunk = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript as string;
        if (event.results[i].isFinal) finalChunk += t;
        else interim += t;
      }
      if (finalChunk) {
        baseText += finalChunk;
        setDraft(baseText);
      }
      setVoiceInterim(interim);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      const code = e?.error;
      setVoiceInterim('');
      if (code === 'aborted' || code === 'no-speech') {
        if (!isIOS || userStopped) setRecording(false);
        return;
      }
      userStopped = true;
      setRecording(false);
    };
    recognition.onend = () => {
      setVoiceInterim('');
      if (isIOS && !userStopped) {
        try {
          recognition.start();
          return;
        } catch {}
      }
      if (!userStopped) setRecording(false);
    };

    recognitionRef.current = {
      stop: () => {
        userStopped = true;
        try {
          recognition.stop();
        } catch {}
      },
    };
    try {
      recognition.start();
      setRecording(true);
    } catch (err) {
      console.warn('recognition.start failed:', err);
    }
  }

  function handleVoiceToggle() {
    if (recording) stopVoice();
    else startVoice();
  }

  if (!checked) {
    return <main className="h-full w-full" />;
  }

  const composedValue = draft + (recording && voiceInterim ? voiceInterim : '');
  const hasText = draft.trim().length > 0;
  const highlightedParts = highlightNames(composedValue, allPeople);

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

      {/* Date hero — the visual centerpiece */}
      <div
        className="absolute inset-x-0 text-center italic"
        style={{
          top: 150,
          fontFamily: 'Georgia, serif',
          fontSize: 32,
          fontWeight: 500,
          lineHeight: 1.1,
          color: INK,
          letterSpacing: '-0.005em',
        }}
      >
        {formatDate()}
      </div>

      {/* Writing area */}
      <div className="absolute" style={{ left: 16, right: 16, top: 286 }}>
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
            {composedValue ? highlightedParts : <>&#8203;</>}
          </div>
          <textarea
            ref={textareaRef}
            value={composedValue}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleInputKeyDown}
            autoFocus
            rows={1}
            readOnly={recording}
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
          {!composedValue && (
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

        {/* Short centered hairline — accent under writing line, not a divider */}
        <div
          style={{
            marginTop: 14,
            marginLeft: 'auto',
            marginRight: 'auto',
            width: '60%',
            height: 0.7,
            background: TAN,
            opacity: 0.5,
          }}
        />

        {/* Action row — mic toggle + send. Mic = icon. Send = mono coral label. */}
        <div
          className="mt-4 flex items-center justify-end"
          style={{ gap: 18 }}
        >
          <button
            onClick={handleVoiceToggle}
            aria-label={recording ? 'Stop voice' : 'Start voice'}
            style={{
              width: 24,
              height: 24,
              background: 'transparent',
              border: 'none',
              padding: 0,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24">
              <rect x={11.2} y={9} width="1.6" height="6" rx="0.8" fill={recording ? CORAL : TAN} />
              <rect x={11.2 - 4} y={7} width="1.6" height="10" rx="0.8" fill={recording ? CORAL : TAN} />
              <rect x={11.2 + 4} y={7} width="1.6" height="10" rx="0.8" fill={recording ? CORAL : TAN} />
              <rect x={11.2 + 8} y={9} width="1.6" height="6" rx="0.8" fill={recording ? CORAL : TAN} />
            </svg>
          </button>
          {hasText && (
            <button
              onClick={sendDraft}
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
