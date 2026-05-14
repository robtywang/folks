'use client';

import { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  saveEntry,
  updateEntrySentiment,
  updateEntryAttribution,
  type SaveResult,
} from '@/lib/save-entry';
import { SentimentSlider } from './sentiment-slider';

type Status =
  | 'idle'
  | 'typing'
  | 'recording'
  | 'cleaning' // post-recording, waiting for /api/punctuate to clean transcript
  | 'saving'
  | 'result'
  | 'error';

interface ComposeCardProps {
  /** Onboarding step 4: gently pulse the mic FAB. */
  micPulse?: boolean;
  /** Any text input or mic tap; used to dismiss step-4 nudge timer. */
  onInteraction?: () => void;
  /** Fires after a successful save with the SaveResult. */
  onSaveComplete?: (r: SaveResult) => void;
}

function voiceErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'microphone blocked — allow access in your browser';
    case 'no-speech':
      return "didn't hear anything — try again";
    case 'audio-capture':
      return 'no microphone found';
    case 'network':
      return "voice service didn't connect — try again, or check vpn/adblocker";
    default:
      return "couldn't start voice — try again";
  }
}

export function ComposeCard({
  micPulse = false,
  onInteraction,
  onSaveComplete,
}: ComposeCardProps = {}) {
  const [text, setText] = useState('');

  // Persist the in-progress compose to localStorage so a backgrounded app,
  // accidental refresh, or mid-recording crash doesn't lose what the user
  // wrote/spoke. Cleared on successful save.
  useEffect(() => {
    try {
      const draft = localStorage.getItem('folks_compose_draft');
      if (draft) setText(draft);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (text.trim()) localStorage.setItem('folks_compose_draft', text);
      else localStorage.removeItem('folks_compose_draft');
    } catch {}
  }, [text]);
  const [interim, setInterim] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<SaveResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingAttribution, setEditingAttribution] = useState(false);
  const [newPersonInput, setNewPersonInput] = useState('');
  const [attributionConfirmed, setAttributionConfirmed] = useState(false);
  // Inline "+ different X" affordance inside the name-clash picker.
  const [addingVariant, setAddingVariant] = useState(false);
  const [variantInput, setVariantInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Existing people the user can re-attribute to.
  const allPeople = useLiveQuery(
    async () => {
      const arr = await db.people.filter((p) => !p.muted).toArray();
      return arr.sort((a, b) => b.closenessScore - a.closenessScore);
    },
    [],
    []
  );

  // Auto-resize textarea — taller floor so the box feels like a journal page.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 200)}px`;
  }, [text]);

  // Auto-dismiss errors after 4s. Detection card sticks around until the user
  // starts a new entry or closes it explicitly.
  useEffect(() => {
    if (status !== 'error') return;
    const timer = setTimeout(() => {
      setStatus('idle');
      setErrorMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [status]);

  // Sentiment override — propagates to DB + recomputes closeness.
  async function handleSentimentChange(next: number) {
    if (!result) return;
    setResult({ ...result, entry: { ...result.entry, sentiment: next } });
    try {
      await updateEntrySentiment(result.entry.id, next);
    } catch (err) {
      console.error('Failed to update sentiment:', err);
    }
  }

  function dismissDetection() {
    setStatus('idle');
    setResult(null);
    setEditingAttribution(false);
    setNewPersonInput('');
    setAttributionConfirmed(false);
    setAddingVariant(false);
    setVariantInput('');
  }

  // Pick a different existing Maya from the clash list, or create a new one
  // with a qualifier ("Maya" + "R" → "Maya R"). The save was already attributed
  // to one of them; reassignTo handles closeness recompute on both sides.
  async function pickClashCandidate(name: string) {
    await reassignTo(name);
    setAddingVariant(false);
    setVariantInput('');
  }

  async function addClashVariant() {
    if (!result?.parsed.primary_person) return;
    const qualifier = variantInput.trim();
    const baseFirst =
      result.parsed.primary_person.trim().split(/\s+/)[0] ?? '';
    if (!baseFirst) return;
    const newName = qualifier ? `${baseFirst} ${qualifier}` : '';
    if (!newName) return;
    await reassignTo(newName);
    setAddingVariant(false);
    setVariantInput('');
  }

  async function confirmAttribution() {
    if (!result) return;
    setAttributionConfirmed(true);
    try {
      await db.entries.update(result.entry.id, {
        userConfirmed: true,
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error('Confirm failed:', err);
    }
  }

  async function reassignTo(name: string | null) {
    if (!result) return;
    try {
      const r = await updateEntryAttribution(
        result.entry.id,
        name === null ? { kind: 'solo' } : { kind: 'person', name }
      );
      setResult({
        ...result,
        attributedTo: r.person?.name ?? null,
        newPersonCreated: false,
        entry: { ...result.entry, personId: r.person?.id ?? null },
      });
      setEditingAttribution(false);
      setNewPersonInput('');
    } catch (err) {
      console.error('Reassign failed:', err);
    }
  }

  async function handleAddNewPerson() {
    const name = newPersonInput.trim();
    if (!name) return;
    await reassignTo(name);
  }

  function startVoice() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser. Try Chrome or Safari.');
      return;
    }

    // iOS Safari's WebSpeech API is buggy with continuous=true — it silently
    // stops delivering results after a brief pause. We detect iOS and fall
    // back to single-utterance mode, auto-restarting in onend until the user
    // explicitly stops. This mimics continuous behavior reliably.
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const recognition = new SpeechRecognition();
    recognition.continuous = !isIOS;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    // Snapshot whatever's already in the textarea so voice appends to it
    // rather than overwriting it. The running accumulator is needed across
    // restarts on iOS so we don't lose earlier utterances.
    let baseText = text ? text + ' ' : '';
    let userStopped = false;

    recognition.onresult = (event: any) => {
      let finalChunk = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalChunk += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      // text holds only finalized chunks; the live italic suffix is rendered
      // separately from `interim`. Without this split, an interim update was
      // landing in both places and the words rendered twice.
      if (finalChunk) {
        baseText = baseText + finalChunk;
        setText(baseText);
      }
      setInterim(interimTranscript);
    };

    recognition.onerror = (e: any) => {
      const code: string = e?.error ?? 'unknown';
      console.warn('Speech recognition error:', code);
      setInterim('');
      // 'no-speech' is normal on iOS between utterances — don't error out,
      // just let onend restart the recognizer.
      if (code === 'aborted' || code === 'no-speech') {
        if (!isIOS || userStopped) {
          setStatus(text ? 'typing' : 'idle');
        }
        return;
      }
      userStopped = true;
      setErrorMessage(voiceErrorMessage(code));
      setStatus('error');
    };

    recognition.onend = () => {
      setInterim('');
      // On iOS, single-utterance mode ends after each pause. If the user
      // hasn't tapped stop, restart so it feels continuous.
      if (isIOS && !userStopped) {
        try {
          recognition.start();
          return;
        } catch (err) {
          console.warn('iOS recognizer restart failed:', err);
        }
      }
      // When the user-initiated stop fired, stopVoice() owns the post-stop
      // status (it transitions to 'cleaning' while punctuation runs). Don't
      // overwrite it here.
      if (!userStopped && status === 'recording') {
        setStatus('typing');
      }
    };

    // Override stopVoice's flag so onend doesn't auto-restart.
    recognitionRef.current = {
      stop: () => {
        userStopped = true;
        try {
          recognition.stop();
        } catch {}
      },
    };
    recognition.start();
    setStatus('recording');
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    setInterim('');
    // Punctuate the raw transcript through Claude Haiku before showing the
    // final text. We capture a snapshot of `text` so the user's text isn't
    // overwritten if they happen to type while the API is in flight.
    void punctuateTranscript();
  }

  async function punctuateTranscript() {
    const snapshot = text.trim();
    if (!snapshot || snapshot.length < 10) {
      setStatus(text ? 'typing' : 'idle');
      return;
    }
    setStatus('cleaning');
    try {
      const res = await fetch('/api/punctuate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: snapshot }),
      });
      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        if (data.text && typeof data.text === 'string') {
          // Only replace if the user hasn't typed in the meantime. If they
          // have, their edits win — we don't clobber.
          setText((current) => (current.trim() === snapshot ? data.text! : current));
        }
      }
    } catch (err) {
      console.warn('Punctuate failed:', err);
    } finally {
      setStatus((s) => (s === 'cleaning' ? (text ? 'typing' : 'idle') : s));
    }
  }

  async function handleSubmit() {
    if (!text.trim()) return;
    setStatus('saving');
    try {
      const r = await saveEntry(text);
      setResult(r);
      setAttributionConfirmed(false); // reset for the new detection
      setText('');
      try {
        localStorage.removeItem('folks_compose_draft');
      } catch {}
      setStatus('result');
      onSaveComplete?.(r);
    } catch (err) {
      console.error('Save failed:', err);
      setErrorMessage("couldn't parse — try again");
      setStatus('error');
    }
  }

  const isRecording = status === 'recording';
  const isCleaning = status === 'cleaning';
  const isSaving = status === 'saving';
  const isResult = status === 'result' && result;

  return (
    <div className="w-full">
      <div
        className="relative rounded-xl border bg-white/40 px-5 py-5 sm:px-6 sm:py-6"
        style={{
          borderColor: 'var(--border-hair)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(31,26,20,0.04), 0 6px 16px rgba(31,26,20,0.04)',
        }}
      >
        {isRecording ? (
          /* Live transcription view — replaces the textarea while recording so
             the words appear in the same space they would once committed. */
          <div
            className="min-h-[200px] whitespace-pre-wrap break-words text-[16px] leading-relaxed text-ink-primary"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            {text}
            {text && interim ? ' ' : ''}
            {interim && (
              <span className="italic text-ink-tertiary">{interim}</span>
            )}
            {!text && !interim && (
              <span className="italic text-ink-tertiary">listening…</span>
            )}
            <span className="recording-caret" aria-hidden="true" />
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (result) setResult(null);
              if (status !== 'saving') setStatus('typing');
              onInteraction?.();
            }}
            placeholder="what's on your mind?"
            disabled={isSaving || isCleaning}
            rows={7}
            className="w-full resize-none bg-transparent text-[16px] leading-relaxed text-ink-primary placeholder:italic placeholder:text-ink-tertiary focus:outline-none disabled:opacity-50"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          />
        )}

        {/* Letterhead hairline separating the writing area from the action row */}
        <div
          className="mt-5 mb-3 h-px"
          style={{ background: 'var(--border-hair)' }}
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isSaving && (
              <div
                className="text-[10px] uppercase tracking-widest text-ink-secondary"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                reading…
              </div>
            )}
            {isCleaning && (
              <div
                className="text-[10px] uppercase tracking-widest text-ink-secondary"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                cleaning up…
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {text.trim() && !isRecording && (
              <button
                onClick={handleSubmit}
                disabled={isSaving}
                className="text-[11px] uppercase tracking-widest text-ink-secondary transition-colors hover:text-ink-primary disabled:opacity-50"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                save →
              </button>
            )}
            {/* Mic — sculpted coral disc. Pulse rings expand only while recording. */}
            <div className="relative">
              {isRecording && (
                <>
                  <span className="recording-ring" aria-hidden="true" />
                  <span className="recording-ring recording-ring-delayed" aria-hidden="true" />
                </>
              )}
              <button
                onClick={() => {
                  onInteraction?.();
                  if (isRecording) stopVoice();
                  else startVoice();
                }}
                disabled={isSaving}
                aria-label={isRecording ? 'Stop recording' : 'Start voice entry'}
                className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-transform hover:scale-[1.04] active:scale-95 disabled:opacity-50 ${
                  micPulse ? 'mic-pulse' : ''
                }`}
                style={{
                  background: 'var(--accent-coral)',
                  boxShadow:
                    'inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 4px rgba(31,26,20,0.08), 0 12px 24px -6px rgba(200, 85, 61, 0.38)',
                }}
              >
                <i
                  className={isRecording ? 'ti ti-player-stop' : 'ti ti-microphone'}
                  style={{ fontSize: 28, color: 'var(--bg-cream)' }}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Detection card — persistent AI interpretation. Stays until the user
          starts a new entry or dismisses it. Sentiment is editable. */}
      {isResult && result && (
        <div
          className="mt-3 rounded-md px-4 py-3"
          style={{
            background: 'rgba(111, 125, 99, 0.08)',
            border: '0.5px solid var(--border-hair)',
            borderLeft: '2px solid var(--accent-sage)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div
                className="text-[10px] uppercase tracking-widest text-ink-secondary"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                detection
              </div>
              <div
                className="mt-1 text-[14px] text-ink-primary"
                style={{ fontFamily: 'var(--font-fraunces)' }}
              >
                {result.attributedTo ? (
                  <>
                    logged to{' '}
                    <em style={{ color: 'var(--accent-coral)' }}>
                      {result.attributedTo}
                    </em>
                    {result.newPersonCreated && (
                      <span className="ml-1 text-[12px] italic text-ink-secondary">
                        · added to your circle
                      </span>
                    )}
                  </>
                ) : (
                  <em className="text-ink-secondary">saved as solo entry</em>
                )}
                <button
                  onClick={() => setEditingAttribution((v) => !v)}
                  className="ml-2 text-[10px] uppercase tracking-widest text-ink-secondary transition-colors hover:text-ink-primary"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {editingAttribution ? '× cancel' : '· change'}
                </button>
              </div>
            </div>
            <button
              onClick={dismissDetection}
              aria-label="Dismiss"
              className="text-ink-tertiary transition-colors hover:text-ink-primary"
            >
              <i className="ti ti-x" style={{ fontSize: 14 }} />
            </button>
          </div>

          {/* Low-confidence confirmation prompt. Shows when AI attributed
              someone but isn't very sure. Lets user explicitly confirm or
              change before moving on. */}
          {result.parsed.confidence < 0.7 &&
            result.attributedTo &&
            !attributionConfirmed &&
            !editingAttribution && (
              <div
                className="mt-3 rounded-md px-3 py-2.5"
                style={{
                  background: 'rgba(200, 85, 61, 0.07)',
                  borderLeft: '2px solid var(--accent-coral)',
                }}
              >
                <div
                  className="text-[12px] italic leading-snug text-ink-primary"
                  style={{ fontFamily: 'var(--font-fraunces)' }}
                >
                  is this really about{' '}
                  <em style={{ color: 'var(--accent-coral)' }}>
                    {result.attributedTo}
                  </em>
                  ? the ai is only {Math.round(result.parsed.confidence * 100)}%
                  sure.
                </div>
                <div className="mt-2 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setEditingAttribution(true)}
                    className="text-[10px] uppercase tracking-widest text-ink-secondary transition-colors hover:text-ink-primary"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    no, change
                  </button>
                  <button
                    onClick={confirmAttribution}
                    className="text-[10px] uppercase tracking-widest text-accent-coral"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    yes →
                  </button>
                </div>
              </div>
            )}

          {editingAttribution && (
            <div
              className="mt-3 rounded-md px-3 py-3"
              style={{
                background: 'rgba(140, 126, 92, 0.06)',
                border: '0.5px solid var(--border-hair)',
              }}
            >
              <div
                className="mb-2 text-[10px] uppercase tracking-widest text-ink-secondary"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                change to
              </div>

              <input
                value={newPersonInput}
                onChange={(e) => setNewPersonInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddNewPerson();
                  }
                }}
                placeholder="type a name…"
                autoFocus
                autoComplete="off"
                className="w-full bg-transparent py-1.5 text-[14px] text-ink-primary placeholder:italic placeholder:text-ink-tertiary focus:outline-none"
                style={{
                  fontFamily: 'var(--font-fraunces)',
                  borderBottom: '0.5px solid var(--border-hair)',
                }}
              />

              {/* Pill row — tap a bubble to save immediately. */}
              {newPersonInput.trim() && (() => {
                const typed = newPersonInput.trim();
                const lower = typed.toLowerCase();
                const matches = allPeople.filter((p) =>
                  p.name.toLowerCase().includes(lower)
                );
                const exact = matches.find(
                  (p) => p.name.toLowerCase() === lower
                );
                return (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {matches.slice(0, 4).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => reassignTo(p.name)}
                        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-opacity hover:opacity-70"
                        style={{
                          borderColor: 'var(--border-hair)',
                          background: 'rgba(200, 85, 61, 0.08)',
                          color: 'var(--accent-coral)',
                          fontFamily: 'var(--font-fraunces)',
                        }}
                      >
                        {p.name}
                        <span
                          className="text-[9px] uppercase tracking-widest text-ink-tertiary"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        >
                          existing
                        </span>
                      </button>
                    ))}
                    {!exact && (
                      <button
                        onClick={handleAddNewPerson}
                        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-opacity hover:opacity-70"
                        style={{
                          borderColor: 'var(--border-hair)',
                          fontFamily: 'var(--font-fraunces)',
                        }}
                      >
                        {typed}
                        <span
                          className="text-[9px] uppercase tracking-widest text-ink-tertiary"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        >
                          new
                        </span>
                      </button>
                    )}
                  </div>
                );
              })()}

              <div className="mt-3 flex items-center justify-end gap-4">
                {result.entry.personId !== null && (
                  <button
                    onClick={() => reassignTo(null)}
                    className="text-[11px] uppercase tracking-widest text-ink-secondary transition-colors hover:text-ink-primary"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    mark solo
                  </button>
                )}
                <button
                  onClick={() => setEditingAttribution(false)}
                  className="text-[11px] uppercase tracking-widest text-ink-secondary transition-colors hover:text-ink-primary"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  cancel
                </button>
              </div>
            </div>
          )}

          {/* Name-clash picker — shown when 2+ people share the attributed
              person's first name. The save already picked one of them; this
              gives the user a chance to switch or split off a new variant. */}
          {result.nameClashes.length >= 2 &&
            !editingAttribution &&
            (() => {
              const baseFirst =
                result.parsed.primary_person?.trim().split(/\s+/)[0] ?? '';
              const candidates = result.nameClashes;
              return (
                <div
                  className="mt-3 rounded-md px-3 py-3"
                  style={{
                    background: 'rgba(140, 126, 92, 0.06)',
                    border: '0.5px solid var(--border-hair)',
                  }}
                >
                  <div
                    className="text-[10px] uppercase tracking-widest text-ink-secondary"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    which {baseFirst.toLowerCase()}?
                  </div>
                  <p
                    className="mt-1 text-[12px] italic leading-snug"
                    style={{
                      fontFamily: 'var(--font-fraunces)',
                      color: '#8C7E5C',
                    }}
                  >
                    you have {candidates.length} people named{' '}
                    {baseFirst.toLowerCase()}. confirm which one this is about.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {candidates.map((p) => {
                      const isCurrent = p.id === result.entry.personId;
                      const lastSeenDays = Math.max(
                        0,
                        Math.floor(
                          (Date.now() - p.lastInteraction) / 86_400_000
                        )
                      );
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => {
                              if (!isCurrent) pickClashCandidate(p.name);
                            }}
                            disabled={isCurrent}
                            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-colors hover:bg-[rgba(31,26,20,0.04)] disabled:cursor-default disabled:bg-[rgba(111,125,99,0.10)]"
                          >
                            <span
                              className="text-[13px] text-ink-primary"
                              style={{ fontFamily: 'var(--font-fraunces)' }}
                            >
                              {p.name}
                              {p.relationship && (
                                <span className="ml-1.5 italic text-ink-tertiary">
                                  · {p.relationship}
                                </span>
                              )}
                            </span>
                            <span
                              className="text-[10px] uppercase tracking-widest text-ink-tertiary"
                              style={{ fontFamily: 'var(--font-mono)' }}
                            >
                              {isCurrent
                                ? 'current'
                                : `${p.entryCount} · ${
                                    lastSeenDays === 0
                                      ? 'today'
                                      : `${lastSeenDays}d ago`
                                  }`}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  {addingVariant ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className="text-[13px] text-ink-primary"
                        style={{ fontFamily: 'var(--font-fraunces)' }}
                      >
                        {baseFirst}
                      </span>
                      <input
                        value={variantInput}
                        onChange={(e) => setVariantInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addClashVariant();
                          }
                        }}
                        placeholder="qualifier (e.g. R, from work)"
                        autoFocus
                        className="flex-1 bg-transparent py-1 text-[13px] text-ink-primary placeholder:italic placeholder:text-ink-tertiary focus:outline-none"
                        style={{
                          fontFamily: 'var(--font-fraunces)',
                          borderBottom: '0.5px solid var(--border-hair)',
                        }}
                      />
                      <button
                        onClick={() => {
                          setAddingVariant(false);
                          setVariantInput('');
                        }}
                        className="text-[10px] uppercase tracking-widest text-ink-secondary"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        cancel
                      </button>
                      <button
                        onClick={addClashVariant}
                        disabled={!variantInput.trim()}
                        className="text-[10px] uppercase tracking-widest text-accent-coral disabled:opacity-40"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        save →
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingVariant(true)}
                      className="mt-2 text-[11px] uppercase tracking-widest text-accent-coral"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      + a different {baseFirst.toLowerCase()}
                    </button>
                  )}
                </div>
              );
            })()}

          <div className="mt-3">
            <div
              className="mb-1.5 text-[10px] uppercase tracking-widest text-ink-secondary"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              sentiment
            </div>
            <SentimentSlider
              value={result.entry.sentiment}
              onChange={handleSentimentChange}
            />
          </div>

          {result.entry.tags.length > 0 && (
            <div className="mt-3">
              <div
                className="mb-1 text-[10px] uppercase tracking-widest text-ink-secondary"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                tags
              </div>
              <div
                className="text-[12px] italic text-ink-secondary"
                style={{ fontFamily: 'var(--font-fraunces)' }}
              >
                {result.entry.tags.join(' · ')}
              </div>
            </div>
          )}

          {/* Always-visible footer — at-a-glance verdict on AI detection.
              Engine tells you whether the real Claude ran or the mock parser
              took over; confidence tells you how sure the engine was. */}
          <div
            className="mt-3 flex items-center justify-between border-t pt-2 text-[10px] uppercase tracking-widest text-ink-tertiary"
            style={{
              fontFamily: 'var(--font-mono)',
              borderColor: 'var(--border-hair)',
            }}
          >
            <span>
              {result.engine === 'mock' ? 'mock parser' : 'claude sonnet'}
            </span>
            <span>
              {Math.round(result.parsed.confidence * 100)}% confident
            </span>
          </div>
        </div>
      )}

      {/* Error toast */}
      {status === 'error' && errorMessage && (
        <div
          className="mt-3 rounded-md px-3 py-2 text-[12px]"
          style={{
            background: 'rgba(200, 85, 61, 0.08)',
            borderLeft: '2px solid var(--accent-coral)',
            fontFamily: 'var(--font-fraunces)',
          }}
        >
          <em className="text-ink-primary">{errorMessage}</em>
        </div>
      )}
    </div>
  );
}
