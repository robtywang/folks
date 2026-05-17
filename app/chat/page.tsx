'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { db } from '@/lib/db';
import { saveEntry } from '@/lib/save-entry';
import type { Entry, Person } from '@/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'folks';
  text: string;
  createdAt: number;
}

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const DAY_MS = 86_400_000;

const TYPING_DEBOUNCE_MS = 2000;
const MIN_WORDS_BEFORE_FIRE = 6;

const FONT_SERIF = 'Georgia, serif';
const FONT_MONO = 'JetBrains Mono, monospace';
const CREAM = '#FAF7F0';
const INK = '#1F1A14';
const INK_MUTED = '#5A5347';
const TAN = '#B4A689';
const CORAL = '#C8553D';

export default function ChatScreen() {
  return (
    <Suspense
      fallback={
        <main
          className="mx-auto h-[100svh] w-full"
          style={{ background: '#FAF7F0', maxWidth: 360 }}
        />
      }
    >
      <ChatScreenInner />
    </Suspense>
  );
}

function ChatScreenInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const seed = searchParams?.get('seed') ?? null;
  const mode = searchParams?.get('mode') ?? null; // 'voice' | null

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentDraft, setCurrentDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [awaitingFolks, setAwaitingFolks] = useState(false);
  // The person this chat is "about" — established from the first mentioned
  // name in any user message and carried forward so pronouns resolve. Updated
  // when a later user message explicitly names a different person.
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  // Voice mode: if true, /chat is actively listening. Each utterance auto-
  // commits as a user message + fires folks-says. User can switch to text
  // mode by typing (mic stops).
  const [voiceMode, setVoiceMode] = useState(mode === 'voice');
  const [voiceInterim, setVoiceInterim] = useState('');

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seededRef = useRef(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Known people for inline coral name-highlighting and corpus lookup.
  const allPeople: Person[] =
    useLiveQuery(async () => {
      const arr = await db.people.toArray();
      return arr.sort((a, b) => b.name.length - a.name.length); // longest first
    }, []) ?? [];

  /** Identify the most likely mentioned person via word-boundary string match. */
  const findMentionedPerson = useCallback(
    (text: string): Person | null => {
      if (!text || allPeople.length === 0) return null;
      const lower = text.toLowerCase();
      for (const p of allPeople) {
        const first = p.name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
        if (!first) continue;
        const re = new RegExp(`\\b${first.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i');
        if (re.test(lower) || lower.includes(p.name.toLowerCase())) return p;
      }
      return null;
    },
    [allPeople]
  );

  /**
   * Call /api/folks-says with the user's thought + the corpus of the active
   * person (whoever this chat thread is "about") + the prior conversation so
   * the AI can resolve pronouns. Append the response as a folks message.
   */
  const fireFolksSays = useCallback(
    async (thought: string, priorMessages: ChatMessage[], activeId: string | null) => {
      // Person resolution: explicitly mentioned in THIS message > active person
      // tracked from earlier in the chat > none.
      let person = findMentionedPerson(thought);
      if (!person && activeId) {
        person = allPeople.find((p) => p.id === activeId) ?? null;
      }
      let entries: Entry[] = [];
      if (person) {
        entries = await db.entries
          .where('personId')
          .equals(person.id)
          .reverse()
          .sortBy('createdAt');
      }
      try {
        const res = await fetch('/api/folks-says', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: thought,
            person: person
              ? {
                  name: person.name,
                  entryCount: person.entryCount,
                  avgSentiment: person.avgSentiment,
                  userContext: person.userContext ?? null,
                  relationship: person.relationship ?? null,
                }
              : null,
            entries: entries.map((e) => ({
              text: e.text,
              sentiment: e.sentiment,
              tags: e.tags,
              daysAgo: Math.floor((Date.now() - e.createdAt) / DAY_MS),
              severity: e.severity ?? 0,
            })),
            // Last ~10 messages of this chat so the AI can resolve "she", "he",
            // "they", "it" against earlier turns. User messages first, then
            // folks responses — mixed in chronological order.
            priorMessages: priorMessages.slice(-10).map((m) => ({
              role: m.role,
              text: m.text,
            })),
          }),
        });
        if (!res.ok) {
          // Quiet fail — surface a soft folks message rather than nothing.
          setMessages((m) => [
            ...m,
            {
              id: uid(),
              role: 'folks',
              text: "i couldn't read that just now — try writing more.",
              createdAt: Date.now(),
            },
          ]);
          setAwaitingFolks(false);
          return;
        }
        const data = (await res.json()) as { content?: string };
        if (data.content) {
          setMessages((m) => [
            ...m,
            { id: uid(), role: 'folks', text: data.content!, createdAt: Date.now() },
          ]);
        }
        setAwaitingFolks(false);
      } catch (err) {
        console.warn('folks-says failed:', err);
        setAwaitingFolks(false);
      }
    },
    [findMentionedPerson, allPeople]
  );

  /** Commit the current draft as a user message and immediately fire folks-says. */
  const commitDraft = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // Identify any newly-mentioned person in this message; if found, that
      // becomes the active subject going forward.
      const mentioned = findMentionedPerson(trimmed);
      let nextActive = activePersonId;
      if (mentioned) {
        nextActive = mentioned.id;
        setActivePersonId(mentioned.id);
      }
      setMessages((prev) => {
        const next = [
          ...prev,
          {
            id: uid(),
            role: 'user' as const,
            text: trimmed,
            createdAt: Date.now(),
          },
        ];
        // Use the snapshot AT commit time as priorMessages — includes the
        // just-added user message so the AI sees the full conversation.
        setAwaitingFolks(true);
        void fireFolksSays(trimmed, next, nextActive);
        return next;
      });
      setCurrentDraft('');
    },
    [fireFolksSays, findMentionedPerson, activePersonId]
  );

  // Seed handling — one-shot, runs after allPeople is loaded so corpus lookup works.
  useEffect(() => {
    if (seededRef.current) return;
    if (!seed) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    commitDraft(seed);
  }, [seed, commitDraft]);

  // Voice mode — auto-start recognition on mount when arriving from home in
  // voice mode. Each utterance auto-commits on silence (1.8s) so the user
  // can keep speaking and folks responds between sentences.
  function stopVoiceMode() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setVoiceMode(false);
    setVoiceInterim('');
  }

  function startVoiceMode() {
    if (typeof window === 'undefined') return;
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => unknown)
      | undefined;
    if (!SR) {
      setVoiceMode(false);
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

    let buffer = '';
    let userStopped = false;

    const SILENCE_MS = 1800;
    const flushUtterance = () => {
      const text = buffer.trim();
      buffer = '';
      setVoiceInterim('');
      if (text) commitDraft(text);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalChunk = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript as string;
        if (event.results[i].isFinal) finalChunk += t;
        else interim += t;
      }
      if (finalChunk) buffer += (buffer.endsWith(' ') || !buffer ? '' : ' ') + finalChunk;
      setVoiceInterim(interim);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(flushUtterance, SILENCE_MS);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      const code = e?.error;
      if (code === 'no-speech' || code === 'aborted') {
        if (!isIOS || userStopped) {
          setVoiceMode(false);
        }
        return;
      }
      userStopped = true;
      setVoiceMode(false);
    };
    recognition.onend = () => {
      if (isIOS && !userStopped) {
        try {
          recognition.start();
          return;
        } catch {}
      }
      setVoiceMode(false);
      setVoiceInterim('');
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
    } catch (err) {
      console.warn('chat recognition.start failed:', err);
      setVoiceMode(false);
    }
  }

  // Auto-start voice when the chat opens in voice mode.
  useEffect(() => {
    if (voiceMode && !recognitionRef.current) startVoiceMode();
    // Cleanup on unmount.
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode]);

  // Debounce: 2s after the user stops typing AND >=6 words → commit + fire.
  function handleDraftChange(next: string) {
    setCurrentDraft(next);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const wordCount = next.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount >= MIN_WORDS_BEFORE_FIRE) {
      debounceTimer.current = setTimeout(() => {
        commitDraft(next);
      }, TYPING_DEBOUNCE_MS);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Shift+Enter inserts a newline; plain Enter commits the message.
    if (e.key === 'Enter' && !e.shiftKey && currentDraft.trim()) {
      e.preventDefault();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      commitDraft(currentDraft);
    }
  }

  function handleCancel() {
    router.push('/');
  }

  // Compile-and-edit flow: tapping "send to journal" opens an inline editor
  // populated with a summarized version of the user's thoughts. The user
  // edits, then confirms to save.
  const [compileOpen, setCompileOpen] = useState(false);
  const [compileDraft, setCompileDraft] = useState('');
  const [compiling, setCompiling] = useState(false);

  function joinUserMessages(): string {
    return messages
      .filter((m) => m.role === 'user')
      .map((m) => m.text)
      .join(' ');
  }

  async function handleSendToJournal() {
    const raw = joinUserMessages();
    if (!raw.trim()) return;
    setCompiling(true);
    try {
      // Ask the server to compile the chat into a clean first-person journal
      // entry. Falls back to the raw concatenation if the API doesn't return.
      const res = await fetch('/api/summarize-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages
            .filter((m) => m.role === 'user')
            .map((m) => m.text),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { content?: string };
        setCompileDraft(data.content?.trim() || raw);
      } else {
        setCompileDraft(raw);
      }
    } catch {
      setCompileDraft(raw);
    } finally {
      setCompiling(false);
      setCompileOpen(true);
    }
  }

  async function confirmSendToJournal() {
    const text = compileDraft.trim();
    if (!text) return;
    setSending(true);
    try {
      await saveEntry(text);
    } catch (err) {
      console.error('send-to-journal failed:', err);
    } finally {
      setSending(false);
      router.push('/');
    }
  }

  const hasUserMessage = useMemo(
    () => messages.some((m) => m.role === 'user'),
    [messages]
  );

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="relative h-full w-full overflow-hidden"
    >
      {/* X cancel — high + left, mirrors home's notebook icon corner */}
      <button
        onClick={handleCancel}
        aria-label="Cancel"
        className="absolute"
        style={{
          left: 14,
          top: 14,
          width: 14,
          height: 14,
          background: 'transparent',
          border: 'none',
          padding: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14">
          <line x1="1" y1="1" x2="13" y2="13" stroke={TAN} strokeWidth="1.4" strokeLinecap="round" />
          <line x1="13" y1="1" x2="1" y2="13" stroke={TAN} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>

      {/* Date hero — same role as home's date, slightly smaller so the chat
          content gets more breathing room. Sits high under the dynamic island. */}
      <div
        className="absolute inset-x-0 text-center italic"
        style={{
          top: 30,
          fontFamily: FONT_SERIF,
          fontSize: 26,
          fontWeight: 500,
          lineHeight: 1.1,
          color: INK,
          letterSpacing: '-0.005em',
        }}
      >
        {formatToday()}
      </div>

      {/* Voice-mode indicator — pulsing coral mic + "listening" label.
          Tap to stop voice and switch to text mode. */}
      {voiceMode && (
        <motion.button
          onClick={stopVoiceMode}
          aria-label="Stop voice"
          animate={{ opacity: [1, 0.55, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute"
          style={{
            right: 14,
            top: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: 'none',
            padding: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <rect x={6.2} y={5} width="1.6" height="4" rx="0.8" fill={CORAL} />
            <rect x={6.2 - 3} y={3.5} width="1.6" height="7" rx="0.8" fill={CORAL} />
            <rect x={6.2 + 3} y={3.5} width="1.6" height="7" rx="0.8" fill={CORAL} />
          </svg>
          <span
            className="text-[10px] uppercase tracking-widest"
            style={{
              fontFamily: FONT_MONO,
              color: CORAL,
              letterSpacing: '0.12em',
            }}
          >
            listening
          </span>
        </motion.button>
      )}

      {/* Scrollable content area + writing area at the bottom */}
      <div
        className="absolute inset-x-0 overflow-y-auto"
        style={{
          top: 84,
          bottom: hasUserMessage ? 110 : 24, // leave room for send pill when visible
          paddingLeft: 12,
          paddingRight: 12,
        }}
      >
        <div className="flex flex-col gap-5">
          {messages.map((m, i) => {
            if (m.role === 'user') {
              return <UserMessage key={m.id} text={m.text} people={allPeople} />;
            }
            // Folks message becomes "stale" only when a later user message
            // exists — i.e., the user has moved on to a new thought. While
            // it's still the latest folks reply, it stays full-opacity.
            const stale = messages
              .slice(i + 1)
              .some((later) => later.role === 'user');
            return <FolksMessage key={m.id} text={m.text} stale={stale} />;
          })}
          {/* Typing indicator — three dots in folks-row position, shown
              between user commit and folks response landing. */}
          {awaitingFolks && <FolksTypingDots />}

          {/* Live voice transcription — shown only in voice mode. Renders
              the in-flight interim text exactly where the next user message
              will land, so the user sees "this is what I hear" → commits to
              a real message on silence. */}
          {voiceMode && voiceInterim && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'relative',
                paddingLeft: 14,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 9,
                  width: 4,
                  height: 4,
                  borderRadius: 50,
                  background: CORAL,
                  boxShadow: '0 0 0 0 rgba(200,85,61,0.5)',
                  animation: 'blink-caret 1s steps(1) infinite',
                }}
              />
              <p
                className="italic"
                style={{
                  fontFamily: FONT_SERIF,
                  fontSize: 16,
                  color: INK_MUTED,
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {voiceInterim}
              </p>
            </motion.div>
          )}

          {/* Voice mode empty state — explicit cue when listening but the
              user hasn't said anything yet. */}
          {voiceMode && !voiceInterim && !awaitingFolks && (
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: CORAL,
              }}
            >
              <span className="folks-dot" style={{ animationDelay: '0s' }} />
              <span className="folks-dot" style={{ animationDelay: '0.18s' }} />
              <span className="folks-dot" style={{ animationDelay: '0.36s' }} />
              <span
                className="text-[10px] uppercase tracking-widest"
                style={{
                  fontFamily: FONT_MONO,
                  color: TAN,
                  letterSpacing: '0.12em',
                  marginLeft: 4,
                }}
              >
                go ahead, i'm listening
              </span>
            </div>
          )}
        </div>

        {/* Active writing area — text mode only. Voice mode owns the bottom
            of the screen via the "listening" pill in the top-right. */}
        {!voiceMode && (
          <ActiveWritingArea
            value={currentDraft}
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            onSend={() => {
              if (debounceTimer.current) clearTimeout(debounceTimer.current);
              commitDraft(currentDraft);
            }}
            showReadyDots={messages.length === 0}
          />
        )}
      </div>

      {/* Send-to-journal pill */}
      {hasUserMessage && !compileOpen && (
        <button
          onClick={handleSendToJournal}
          disabled={compiling}
          className="absolute active:scale-[0.97] transition-transform"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 44,
            width: 200,
            height: 46,
            borderRadius: 23,
            background: CORAL,
            border: 'none',
          }}
        >
          <span
            className="italic"
            style={{
              fontFamily: FONT_SERIF,
              fontSize: 14,
              color: CREAM,
            }}
          >
            {compiling ? 'compiling…' : 'send to journal'}
          </span>
        </button>
      )}

      {/* Compile-and-edit drawer — slides up from the bottom and covers
          ~60% of the viewport. Chat history stays visible above so the user
          can scroll the chat behind to re-read. Tap × or back arrow to
          dismiss; tap save to commit to the journal. */}
      {compileOpen && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="absolute inset-x-0 bottom-0"
          style={{
            height: '62%',
            background: CREAM,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            borderTop: `0.5px solid ${TAN}`,
            boxShadow: '0 -6px 20px rgba(31,26,20,0.06)',
          }}
        >
          {/* Drawer top — small handle + label + back arrow */}
          <div className="relative" style={{ height: 44 }}>
            <button
              onClick={() => setCompileOpen(false)}
              aria-label="Back to chat"
              className="absolute"
              style={{ left: 14, top: 14, width: 18, height: 14, background: 'transparent', border: 'none', padding: 0 }}
            >
              <svg width="18" height="14" viewBox="0 0 18 14">
                <line x1="6" y1="2" x2="2" y2="7" stroke={TAN} strokeWidth="1.4" strokeLinecap="round" />
                <line x1="2" y1="7" x2="6" y2="12" stroke={TAN} strokeWidth="1.4" strokeLinecap="round" />
                <line x1="2" y1="7" x2="16" y2="7" stroke={TAN} strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            <div
              className="absolute inset-x-0 text-center italic"
              style={{
                top: 14,
                fontFamily: FONT_SERIF,
                fontSize: 13,
                color: INK_MUTED,
              }}
            >
              review entry
            </div>
          </div>

          {/* Editable compiled entry */}
          <div
            className="absolute"
            style={{ left: 12, right: 12, top: 50, bottom: 84 }}
          >
            <textarea
              value={compileDraft}
              onChange={(e) => setCompileDraft(e.target.value)}
              autoFocus
              className="italic"
              style={{
                width: '100%',
                height: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontFamily: FONT_SERIF,
                fontSize: 16,
                color: INK,
                caretColor: INK,
                padding: 0,
                lineHeight: 1.55,
              }}
            />
          </div>

          {/* Save pill anchored to drawer bottom */}
          <button
            onClick={confirmSendToJournal}
            disabled={sending || !compileDraft.trim()}
            className="absolute active:scale-[0.97] transition-transform"
            style={{
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: 20,
              width: 200,
              height: 46,
              borderRadius: 23,
              background: CORAL,
              border: 'none',
              opacity: !compileDraft.trim() ? 0.5 : 1,
            }}
          >
            <span
              className="italic"
              style={{
                fontFamily: FONT_SERIF,
                fontSize: 14,
                color: CREAM,
              }}
            >
              {sending ? 'saving…' : 'save to journal'}
            </span>
          </button>
        </motion.div>
      )}
    </motion.main>
  );
}

/* ─── Components ──────────────────────────────────────────────────────── */

function UserMessage({ text, people }: { text: string; people: Person[] }) {
  const parts = useMemo(() => highlightNames(text, people), [text, people]);
  return (
    <p
      className="italic"
      style={{
        fontFamily: FONT_SERIF,
        fontSize: 16,
        color: INK,
        lineHeight: 1.5,
        margin: 0,
      }}
    >
      {parts}
    </p>
  );
}

/**
 * Folks message stays at full opacity while it's the most recent reply.
 * Once the user submits another message after it (becoming "stale"), it
 * fades to a soft ghost state — preserving history without competing with
 * the current turn.
 */
function FolksMessage({ text, stale }: { text: string; stale: boolean }) {
  const target = stale
    ? { opacity: 0.28, y: 0, duration: 1.6 }
    : { opacity: 1, y: 0, duration: 0.3 };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: target.opacity, y: target.y }}
      transition={{ duration: target.duration, ease: 'easeOut' }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 9,
          letterSpacing: 1,
          color: TAN,
          textTransform: 'lowercase',
          marginBottom: 6,
        }}
      >
        — folks
      </div>
      <p
        className="italic"
        style={{
          fontFamily: FONT_SERIF,
          fontSize: 16,
          color: INK_MUTED,
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {text}
      </p>
    </motion.div>
  );
}

/** Three-dot typing indicator in the folks message slot. */
function FolksTypingDots() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 9,
          letterSpacing: 1,
          color: TAN,
          textTransform: 'lowercase',
          marginBottom: 6,
        }}
      >
        — folks
      </div>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', color: INK_MUTED }}>
        <span className="folks-dot" style={{ animationDelay: '0s' }} />
        <span className="folks-dot" style={{ animationDelay: '0.18s' }} />
        <span className="folks-dot" style={{ animationDelay: '0.36s' }} />
      </div>
    </motion.div>
  );
}

function ActiveWritingArea({
  value,
  onChange,
  onKeyDown,
  onSend,
  showReadyDots = false,
}: {
  value: string;
  onChange: (s: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  showReadyDots?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Auto-grow so the box extends downward as text wraps.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 24)}px`;
  }, [value]);
  // Force focus on mount — some mobile browsers ignore autoFocus on
  // programmatic navigation, leaving the caret invisible until tap.
  useEffect(() => {
    const id = setTimeout(() => ref.current?.focus(), 80);
    return () => clearTimeout(id);
  }, []);

  const trimmed = value.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{ marginTop: 24, position: 'relative' }}
    >
      <div style={{ position: 'relative' }}>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          rows={1}
          className="italic"
          style={{
            display: 'block',
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            fontFamily: FONT_SERIF,
            fontSize: 16,
            color: INK,
            caretColor: INK,
            padding: 0,
            lineHeight: '24px',
          }}
        />
        {/* Ready indicator — three pulsing dots in the empty writing area
            (only on the very first turn, when there are no messages yet).
            Reads as "ready when you are" without confusing it with a typing
            cursor. Pointer-events: none so taps still focus the textarea. */}
        {!value && showReadyDots && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 1,
              top: 8,
              display: 'flex',
              gap: 5,
              alignItems: 'center',
              color: TAN,
              pointerEvents: 'none',
            }}
          >
            <span className="folks-dot" style={{ animationDelay: '0s' }} />
            <span className="folks-dot" style={{ animationDelay: '0.18s' }} />
            <span className="folks-dot" style={{ animationDelay: '0.36s' }} />
          </div>
        )}
      </div>
      {/* Send button — explicit prompt-the-AI affordance for mobile, where
          Enter on a textarea inserts a newline rather than submitting. */}
      {trimmed.length > 0 && (
        <div className="mt-2 flex items-center justify-end">
          <button
            onClick={onSend}
            className="text-[11px] uppercase tracking-widest"
            style={{
              fontFamily: FONT_MONO,
              fontWeight: 500,
              color: CORAL,
              background: 'transparent',
              border: 'none',
              letterSpacing: '0.12em',
            }}
          >
            send →
          </button>
        </div>
      )}
    </motion.div>
  );
}

/** Wrap matched person first-names in coral spans for inline highlighting. */
function highlightNames(text: string, people: Person[]): React.ReactNode[] {
  if (people.length === 0) return [text];
  const tokens = people
    .map((p) => p.name.trim().split(/\s+/)[0])
    .filter((t): t is string => !!t)
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
