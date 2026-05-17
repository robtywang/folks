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
import { db, findPersonByName, createPerson } from '@/lib/db';
import { parseEntry } from '@/lib/ai';
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
  const autoVoice = searchParams?.get('voice') === '1';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentDraft, setCurrentDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [awaitingFolks, setAwaitingFolks] = useState(false);
  // The person this chat is "about" — established from the first mentioned
  // name in any user message and carried forward so pronouns resolve. Updated
  // when a later user message explicitly names a different person.
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  // Voice as input method (not a separate mode). Tap mic → recording fills
  // the textarea. User explicitly taps send to commit. Text mode is always
  // available alongside.
  const [recording, setRecording] = useState(false);
  const [voiceInterim, setVoiceInterim] = useState('');

  const seededRef = useRef(false);
  const voiceAutoStartedRef = useRef(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  // The voice accumulator. Held in a ref so commitDraft can reset it after
  // a message is sent — otherwise the previous utterance keeps getting
  // re-pasted on top of the new one.
  const voiceBufferRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);

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
   * Find ALL known people referenced in a message — used to tell the AI
   * about every name the user mentioned, not just the first one. Without
   * this, "oliver and daniel" only surfaces oliver and the AI says
   * "who's daniel?" Returns the matched Person records, deduped.
   */
  const findAllMentionedPeople = useCallback(
    (text: string): Person[] => {
      if (!text || allPeople.length === 0) return [];
      const lower = text.toLowerCase();
      const out: Person[] = [];
      const seen = new Set<string>();
      for (const p of allPeople) {
        if (seen.has(p.id)) continue;
        const first = p.name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
        if (!first) continue;
        const re = new RegExp(
          `\\b${first.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`,
          'i'
        );
        if (re.test(lower) || lower.includes(p.name.toLowerCase())) {
          out.push(p);
          seen.add(p.id);
        }
      }
      return out;
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
      // Find every known person referenced this turn — used by the API to
      // acknowledge each name even though we only fetch corpus for one.
      const allMentioned = findAllMentionedPeople(thought);
      let person: Person | null = allMentioned[0] ?? null;
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
            // Names from THIS message that resolve to known folks. The API
            // uses this to acknowledge every mentioned name, not just the
            // primary one whose corpus we fetched.
            mentionedPeople: allMentioned.map((p) => p.name),
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
    [findMentionedPerson, findAllMentionedPeople, allPeople]
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
      } else {
        // Local match found nothing — fire parseEntry in the background to
        // discover any new name and lazy-create a transient Person record
        // so subsequent turns + chats inherit context.
        void (async () => {
          try {
            const { parsed } = await parseEntry(trimmed);
            if (
              parsed.primary_person &&
              parsed.confidence >= 0.6 &&
              !parsed.is_solo
            ) {
              const existing = await findPersonByName(parsed.primary_person);
              if (!existing) {
                const created = await createPerson(parsed.primary_person, {
                  isTransient: true,
                });
                setActivePersonId(created.id);
              } else if (!activePersonId) {
                setActivePersonId(existing.id);
              }
            }
          } catch {}
        })();
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
      // Clear everything tied to the in-flight draft so the next utterance
      // starts fresh — the voice buffer especially, otherwise prior text
      // gets re-pasted on top of new transcriptions.
      voiceBufferRef.current = '';
      setVoiceInterim('');
      setCurrentDraft('');
    },
    [fireFolksSays, findMentionedPerson, activePersonId]
  );

  // Seed handling — render the seed message INSTANTLY on mount, then run
  // parse + folks-says in the background. Previously the user landed on a
  // blank-looking chat for a beat while parse ran; now their first thought
  // is on screen immediately and "folks is thinking" dots appear underneath.
  useEffect(() => {
    if (seededRef.current) return;
    if (!seed) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    const trimmed = seed.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      text: trimmed,
      createdAt: Date.now(),
    };
    // Show the seed immediately — no waiting.
    setMessages([userMsg]);
    setAwaitingFolks(true);

    // In the background: discover/persist the person + fire folks-says.
    (async () => {
      let activeId: string | null = null;
      // First, check if any known person matches via local scan.
      const localMatch = findMentionedPerson(trimmed);
      if (localMatch) {
        activeId = localMatch.id;
        setActivePersonId(localMatch.id);
      } else {
        try {
          const { parsed } = await parseEntry(trimmed);
          if (
            parsed.primary_person &&
            parsed.confidence >= 0.6 &&
            !parsed.is_solo
          ) {
            const existing = await findPersonByName(parsed.primary_person);
            if (existing) {
              activeId = existing.id;
            } else {
              const created = await createPerson(parsed.primary_person, {
                isTransient: true,
              });
              activeId = created.id;
            }
            setActivePersonId(activeId);
          }
        } catch (err) {
          console.warn('seed parse failed:', err);
        }
      }
      await fireFolksSays(trimmed, [userMsg], activeId);
    })();
  }, [seed, findMentionedPerson, fireFolksSays]);

  // Voice as input method. Recognition is initialized ONCE per chat session
  // and then muted/unmuted on toggle — one permission prompt, one start-ding,
  // no re-init lag. iOS Safari fires onend after each utterance even with
  // continuous=true, so we restart in onend until the user explicitly leaves.
  const recognitionInitedRef = useRef(false);
  const muteRef = useRef(true);

  function initRecognition(): boolean {
    if (recognitionInitedRef.current) return true;
    if (typeof window === 'undefined') return false;
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => unknown)
      | undefined;
    if (!SR) {
      alert('voice input is not supported in this browser. try chrome or safari.');
      return false;
    }
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SR() as any;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      if (muteRef.current) return; // muted — ignore audio while user is "not recording"
      let finalChunk = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript as string;
        if (event.results[i].isFinal) finalChunk += t;
        else interim += t;
      }
      if (finalChunk) {
        voiceBufferRef.current += finalChunk;
        setCurrentDraft(voiceBufferRef.current);
      }
      setVoiceInterim(interim);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      const code = e?.error;
      setVoiceInterim('');
      // no-speech / aborted are normal on iOS between utterances — onend
      // restart handles continuity. Other errors flip state off.
      if (code !== 'no-speech' && code !== 'aborted') {
        muteRef.current = true;
        setRecording(false);
      }
    };
    recognition.onend = () => {
      setVoiceInterim('');
      // Keep recognition alive across iOS utterance boundaries.
      if (isIOS) {
        try {
          recognition.start();
          return;
        } catch {}
      }
    };

    recognitionRef.current = {
      stop: () => {
        try {
          recognition.stop();
        } catch {}
      },
    };
    try {
      recognition.start();
      recognitionInitedRef.current = true;
      return true;
    } catch (err) {
      console.warn('chat recognition.start failed:', err);
      return false;
    }
  }

  function toggleVoice() {
    if (recording) {
      // Mute — keep recognition alive so the next toggle is instant.
      muteRef.current = true;
      setRecording(false);
      setVoiceInterim('');
      return;
    }
    // Optimistic visual update so the listening graphic appears instantly
    // on tap, even before recognition spins up. Reverted on init failure.
    voiceBufferRef.current = currentDraft
      ? currentDraft + (currentDraft.endsWith(' ') ? '' : ' ')
      : '';
    setRecording(true);
    const ok = initRecognition();
    if (!ok) {
      setRecording(false);
      return;
    }
    muteRef.current = false;
  }

  // Cleanup recognition on unmount.
  useEffect(() => {
    return () => {
      muteRef.current = true;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      recognitionInitedRef.current = false;
    };
  }, []);

  // If we arrived via voice mode on home, auto-start the mic so the
  // conversation continues hands-free. Triggered after seed handling so
  // the first user message lands first, then voice listens for follow-ups.
  useEffect(() => {
    if (!autoVoice) return;
    if (voiceAutoStartedRef.current) return;
    voiceAutoStartedRef.current = true;
    const id = setTimeout(() => {
      // Use toggleVoice's start path so the always-alive recognition is
      // initialized and unmuted in one step.
      if (!recording) toggleVoice();
    }, 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVoice]);

  // Auto-scroll: keep the latest content visible as messages stream in.
  useEffect(() => {
    const el = bottomAnchorRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, awaitingFolks, recording]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Shift+Enter inserts a newline; plain Enter commits the message.
    if (e.key === 'Enter' && !e.shiftKey && currentDraft.trim()) {
      e.preventDefault();
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


      {/* Scrollable content area + writing area at the bottom */}
      <div
        ref={scrollRef}
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
        </div>

        {/* Active writing area — text and voice both fill this surface.
            Ready-dots hide while folks is replying so we don't stack two
            pulsing-dot animations on top of each other. */}
        <ActiveWritingArea
          value={currentDraft + (recording && voiceInterim ? voiceInterim : '')}
          onChange={(s) => setCurrentDraft(s)}
          onKeyDown={handleKeyDown}
          onSend={() => commitDraft(currentDraft)}
          onMicToggle={toggleVoice}
          recording={recording}
          showReadyDots={!awaitingFolks}
          showActionRow={!awaitingFolks}
        />
        {/* Bottom anchor for auto-scroll to keep the most recent content in
            view when folks responds or recording state changes. */}
        <div ref={bottomAnchorRef} />
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
  onMicToggle,
  recording,
  showReadyDots = true,
  showActionRow = true,
}: {
  value: string;
  onChange: (s: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onMicToggle: () => void;
  recording: boolean;
  showReadyDots?: boolean;
  showActionRow?: boolean;
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
        {/* Ready indicator — a single thin blinking caret at the writing
            line's start position. Visually distinct from the folks-typing
            indicator (also dots) so the user can tell at a glance whether
            it's their turn to write or whether folks is replying. */}
        {!value && showReadyDots && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 1,
              top: 5,
              width: 1.6,
              height: 16,
              background: INK,
              animation: 'blink-caret 1.05s steps(1) infinite',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      {/* Action row: mic toggle on the left, send on the right when there
          is text. Both modes (voice + text) always available. Hidden while
          folks is thinking so the user doesn't try to add more mid-reply. */}
      {showActionRow && (
      <div className="mt-3 flex items-center justify-between" style={{ gap: 18 }}>
        <button
          onClick={onMicToggle}
          aria-label={recording ? 'Stop recording' : 'Start voice'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            border: 'none',
            padding: 0,
          }}
        >
          <svg width="26" height="26" viewBox="0 0 26 26">
            <rect x={12.2} y={9} width="1.6" height="8" rx="0.8" fill={recording ? CORAL : TAN} />
            <rect x={12.2 - 4.5} y={6.5} width="1.6" height="13" rx="0.8" fill={recording ? CORAL : TAN} />
            <rect x={12.2 + 4.5} y={6.5} width="1.6" height="13" rx="0.8" fill={recording ? CORAL : TAN} />
            <rect x={12.2 + 9} y={9} width="1.6" height="8" rx="0.8" fill={recording ? CORAL : TAN} />
          </svg>
          <span
            className="text-[12px] italic"
            style={{
              fontFamily: FONT_SERIF,
              color: recording ? CORAL : INK_MUTED,
              lineHeight: 1,
            }}
          >
            {recording ? 'listening…' : 'tap to speak'}
          </span>
        </button>
        {trimmed.length > 0 && (
          <button
            onClick={onSend}
            className="text-[12px] uppercase tracking-widest"
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
        )}
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
