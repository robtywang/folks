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
  const monthDay = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
  return `Today · ${monthDay}`;
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

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentDraft, setCurrentDraft] = useState('');
  const [sending, setSending] = useState(false);
  // The person this chat is "about" — established from the first mentioned
  // name in any user message and carried forward so pronouns resolve. Updated
  // when a later user message explicitly names a different person.
  const [activePersonId, setActivePersonId] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seededRef = useRef(false);

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
          return;
        }
        const data = (await res.json()) as { content?: string };
        if (data.content) {
          setMessages((m) => [
            ...m,
            { id: uid(), role: 'folks', text: data.content!, createdAt: Date.now() },
          ]);
        }
      } catch (err) {
        console.warn('folks-says failed:', err);
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
      className="relative mx-auto h-[100svh] w-full overflow-hidden"
      style={{ background: CREAM, maxWidth: 360 }}
    >
      {/* Top chrome */}
      <button
        onClick={handleCancel}
        aria-label="Cancel"
        className="absolute"
        style={{ left: 26, top: 82, width: 12, height: 12 }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          <line x1="1" y1="1" x2="11" y2="11" stroke={TAN} strokeWidth="1.4" strokeLinecap="round" />
          <line x1="11" y1="1" x2="1" y2="11" stroke={TAN} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      <div
        className="absolute inset-x-0 text-center italic"
        style={{
          top: 88,
          fontFamily: FONT_SERIF,
          fontSize: 13,
          color: INK_MUTED,
        }}
      >
        {formatToday()}
      </div>

      {/* Scrollable content area + writing area at the bottom */}
      <div
        className="absolute inset-x-0 overflow-y-auto"
        style={{
          top: 140,
          bottom: hasUserMessage ? 110 : 24, // leave room for send pill when visible
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        <div className="flex flex-col gap-5">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <UserMessage key={m.id} text={m.text} people={allPeople} />
            ) : (
              <FolksMessage key={m.id} text={m.text} />
            )
          )}
        </div>

        {/* Active writing area — slides in below the latest content */}
        <ActiveWritingArea
          value={currentDraft}
          onChange={handleDraftChange}
          onKeyDown={handleKeyDown}
        />
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

      {/* Compile-and-edit overlay — appears when the user taps send. They can
          edit the summarized journal entry before confirming the save. */}
      {compileOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className="absolute inset-0"
          style={{ background: CREAM }}
        >
          <button
            onClick={() => setCompileOpen(false)}
            aria-label="Back to chat"
            className="absolute"
            style={{ left: 26, top: 82, width: 12, height: 12 }}
          >
            <svg width="14" height="12" viewBox="0 0 14 12">
              <line x1="5" y1="1" x2="1" y2="6" stroke={TAN} strokeWidth="1.4" strokeLinecap="round" />
              <line x1="1" y1="6" x2="5" y2="11" stroke={TAN} strokeWidth="1.4" strokeLinecap="round" />
              <line x1="1" y1="6" x2="13" y2="6" stroke={TAN} strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <div
            className="absolute inset-x-0 text-center italic"
            style={{
              top: 88,
              fontFamily: FONT_SERIF,
              fontSize: 13,
              color: INK_MUTED,
            }}
          >
            review entry
          </div>
          <div
            className="absolute"
            style={{ left: 16, right: 16, top: 140, bottom: 110 }}
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
          <button
            onClick={confirmSendToJournal}
            disabled={sending || !compileDraft.trim()}
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
 * Folks message lifecycle:
 *   t=0     → mount, opacity 0, y +4
 *   t=0.3s  → opacity 1, y 0 (fade-in complete)
 *   t=4.3s  → start fading to 0.4 over 2s
 *   t=6.3s  → continue to 0.08 over 10s
 *   t=16.3s → stay at 0.08 (visible-ghost state)
 */
function FolksMessage({ text }: { text: string }) {
  type Phase = 'enter' | 'visible' | 'fading' | 'ghost';
  const [phase, setPhase] = useState<Phase>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('visible'), 300); // fade-in done
    const t2 = setTimeout(() => setPhase('fading'), 300 + 4000); // start 2s fade
    const t3 = setTimeout(() => setPhase('ghost'), 300 + 4000 + 2000); // start 10s fade
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const target = (() => {
    switch (phase) {
      case 'enter':
        return { opacity: 0, y: 4, duration: 0 };
      case 'visible':
        return { opacity: 1, y: 0, duration: 0.3 };
      case 'fading':
        return { opacity: 0.4, y: 0, duration: 2 };
      case 'ghost':
        return { opacity: 0.08, y: 0, duration: 10 };
    }
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: target.opacity, y: target.y }}
      transition={{ duration: target.duration, ease: 'linear' }}
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

function ActiveWritingArea({
  value,
  onChange,
  onKeyDown,
}: {
  value: string;
  onChange: (s: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Auto-grow so the box extends downward as text wraps.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 24)}px`;
  }, [value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{ marginTop: 24, position: 'relative' }}
    >
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
