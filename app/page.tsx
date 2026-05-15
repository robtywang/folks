'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { getMeta, setMeta } from '@/lib/db';
import { pruneAllOrphans } from '@/lib/save-entry';
import { recomputeAll } from '@/lib/closeness';
import { expireOldPrompts } from '@/lib/prompts';
import { hasLockPin } from '@/lib/lock';
import { ALL_PROMPTS } from '@/lib/session-prompts';

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

export default function Home() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [draft, setDraft] = useState('');
  const [voiceInterim, setVoiceInterim] = useState('');
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Cycling typewriter placeholder — character-by-character, holds, erases,
  // then the next prompt starts. Evening-biased pool.
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
        const t = setTimeout(() => {
          if (!cancelled) setTypedCount((c) => c + 1);
        }, TYPE_MS);
        return () => {
          cancelled = true;
          clearTimeout(t);
        };
      }
      const t = setTimeout(() => {
        if (!cancelled) setTypePhase('erasing');
      }, HOLD_MS);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
    if (typedCount > 0) {
      const t = setTimeout(() => {
        if (!cancelled) setTypedCount((c) => c - 1);
      }, ERASE_MS);
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
    return (
      <main className="h-[100svh] w-full" />
    );
  }

  const composedValue = draft + (recording && voiceInterim ? voiceInterim : '');
  const hasText = draft.trim().length > 0;

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="relative h-[100svh] w-full overflow-hidden"
    >
      {/* Wordmark — bigger, higher, italic Georgia centered. */}
      <div
        className="absolute inset-x-0 text-center italic"
        style={{
          top: 52,
          fontFamily: 'Georgia, serif',
          fontSize: 24,
          fontWeight: 500,
          lineHeight: 1,
          color: '#1F1A14',
        }}
      >
        folks
      </div>

      {/* Journal link — italic wordmark at top-right, paired typographically
          with "folks" rather than a generic icon. */}
      <button
        onClick={() => router.push('/journal')}
        aria-label="Open journal"
        className="absolute italic"
        style={{
          right: 18,
          top: 58,
          fontFamily: 'Georgia, serif',
          fontSize: 14,
          color: '#B4A689',
          background: 'transparent',
          border: 'none',
          lineHeight: 1,
        }}
      >
        journal →
      </button>

      {/* Date hero — the visual centerpiece. */}
      <div
        className="absolute inset-x-0 text-center italic"
        style={{
          top: 170,
          fontFamily: 'Georgia, serif',
          fontSize: 32,
          fontWeight: 500,
          lineHeight: 1.1,
          color: '#1F1A14',
          letterSpacing: '-0.005em',
        }}
      >
        {formatDate()}
      </div>

      {/* Writing area — edges-extending padding, textarea auto-grows. */}
      <div className="absolute" style={{ left: 16, right: 16, top: 300 }}>
        <div style={{ position: 'relative' }}>
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
              display: 'block',
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
              fontFamily: 'Georgia, serif',
              fontSize: 16,
              color: '#1F1A14',
              caretColor: '#1F1A14',
              padding: 0,
              lineHeight: '24px',
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
                color: '#B4A689',
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
                  background: '#B4A689',
                  verticalAlign: 'middle',
                  marginLeft: 1,
                  animation: 'blink-caret 1.05s steps(1) infinite',
                }}
              />
            </span>
          )}
        </div>

        {/* Hairline under the writing line. */}
        <div
          style={{
            marginTop: 14,
            height: 0.7,
            background: '#B4A689',
            opacity: 0.55,
          }}
        />

        {/* Action row — settings-style mono labels. Voice always available;
            send appears when there's text in the draft. */}
        <div
          className="mt-4 flex items-center justify-end"
          style={{ gap: 20 }}
        >
          <button
            onClick={handleVoiceToggle}
            className="text-[11px] uppercase tracking-widest"
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 500,
              color: recording ? '#C8553D' : '#B4A689',
              background: 'transparent',
              border: 'none',
              letterSpacing: '0.12em',
            }}
          >
            {recording ? 'stop →' : 'start →'}
          </button>
          {hasText && (
            <button
              onClick={sendDraft}
              className="text-[11px] uppercase tracking-widest"
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 500,
                color: '#C8553D',
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
