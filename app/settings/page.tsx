'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { db, getMeta, setMeta } from '@/lib/db';
import { seedTestData } from '@/lib/seed';
import { generateWeeklyRecap, saveWeeklyRecap } from '@/lib/weekly-recap';
import { maybeRefreshPrompts } from '@/lib/prompts';
import {
  hasLockPin,
  setLockPin,
  clearLockPin,
  verifyPin,
  lock as lockNow,
  useLockState,
  UNLOCK_MODES,
  type UnlockMode,
  getUnlockMode,
  setUnlockMode,
} from '@/lib/lock';
import { PinPad } from '@/components/pin-pad';

// Module-level rate-limit state. Resets when the page is reloaded so a
// determined retry can't just refresh away the cooldown easily — but the
// counter doesn't survive an app close, which is intentional per spec.
let failedAttempts = 0;
let lockoutUntil = 0;

function recordFailedAttempt(): { rateLimited: boolean } {
  failedAttempts += 1;
  if (failedAttempts >= 5) {
    lockoutUntil = Date.now() + 60_000;
    failedAttempts = 0;
    return { rateLimited: true };
  }
  return { rateLimited: false };
}

function clearFailedAttempts() {
  failedAttempts = 0;
}

const PASSCODE_FLOWS = {
  IDLE: 'idle',
  SET_ENTER: 'set-enter',
  SET_HINT: 'set-hint',
  SET_CONFIRM: 'set-confirm',
  CHANGE_CURRENT: 'change-current',
  CHANGE_NEW: 'change-new',
  CHANGE_CONFIRM: 'change-confirm',
  REMOVE_CONFIRM: 'remove-confirm',
} as const;
type PasscodeFlow = (typeof PASSCODE_FLOWS)[keyof typeof PASSCODE_FLOWS];

type Busy = 'export' | 'delete' | 'seed' | 'pin' | 'recap' | 'prompts' | null;

const USER_NAME_KEY = 'folks_user_name';
const USER_ABOUT_KEY = 'folks_user_about';

export default function SettingsPage() {
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const [recapResult, setRecapResult] = useState<string | null>(null);
  const [promptsResult, setPromptsResult] = useState<string | null>(null);

  // "you" section state — auto-saves on every change.
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const aboutRef = useRef<HTMLTextAreaElement>(null);

  // Security state — unified flow handles set, change, remove
  const [passcodeFlow, setPasscodeFlow] = useState<PasscodeFlow>(
    PASSCODE_FLOWS.IDLE
  );
  const [pinCurrent, setPinCurrent] = useState('');
  const [pinNew, setPinNew] = useState('');
  const [pinNewConfirm, setPinNewConfirm] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinShake, setPinShake] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // null = still loading from Dexie. true once user has seen the warning.
  const [hasSeenWarning, setHasSeenWarning] = useState<boolean | null>(null);
  // Live-updating now timestamp drives the rate-limit countdown.
  const [now, setNow] = useState(() => Date.now());
  const { pinSet, locked, unlocked } = useLockState();
  const [hintDraft, setHintDraft] = useState('');
  const [unlockMode, setUnlockModeState] = useState<UnlockMode>('this-session');
  const [aiReady, setAiReady] = useState<boolean | null>(null);

  // Hydrate unlock mode on mount.
  useEffect(() => {
    setUnlockModeState(getUnlockMode());
  }, []);

  // Check whether the server has an ANTHROPIC_API_KEY loaded. The key never
  // leaves the server; we just ask for a boolean.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/status')
      .then((r) => r.json())
      .then((d: { aiReady?: boolean }) => {
        if (!cancelled) setAiReady(Boolean(d.aiReady));
      })
      .catch(() => {
        if (!cancelled) setAiReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleUnlockModeChange(next: UnlockMode) {
    if (next === unlockMode) return;
    setUnlockModeState(next);
    setUnlockMode(next);
    // Switching to every-time means a re-lock is implied — drop the session.
    if (next === 'every-time') lockNow();
  }

  // Tick once a second while a lockout is active so the UI re-enables.
  useEffect(() => {
    if (lockoutUntil <= now) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [now]);

  const lockoutRemainingSec =
    lockoutUntil > now ? Math.ceil((lockoutUntil - now) / 1000) : 0;
  const isRateLimited = lockoutRemainingSec > 0;

  function flashToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  function resetFlow() {
    setPasscodeFlow(PASSCODE_FLOWS.IDLE);
    setPinCurrent('');
    setPinNew('');
    setPinNewConfirm('');
    setPinError(null);
    setPinShake(false);
  }

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      setName(localStorage.getItem(USER_NAME_KEY) ?? '');
      setAbout(localStorage.getItem(USER_ABOUT_KEY) ?? '');
    } catch {
      // ignore
    }
    getMeta<boolean>('hasSeenPasscodeWarning').then((seen) => {
      setHasSeenWarning(seen === true);
    });
  }, []);

  // Auto-grow the about-you textarea so the whole entry stays visible.
  useEffect(() => {
    const el = aboutRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [about]);

  // First time the user types in initial passcode setup, mark warning seen.
  useEffect(() => {
    if (
      passcodeFlow === PASSCODE_FLOWS.SET_ENTER &&
      pinNew.length > 0 &&
      hasSeenWarning === false
    ) {
      setMeta('hasSeenPasscodeWarning', true);
      setHasSeenWarning(true);
    }
  }, [pinNew, passcodeFlow, hasSeenWarning]);

  // Clear error as soon as the user types again in any flow.
  useEffect(() => {
    if (pinError && (pinCurrent.length > 0 || pinNew.length > 0 || pinNewConfirm.length > 0)) {
      setPinError(null);
    }
  }, [pinCurrent, pinNew, pinNewConfirm, pinError]);

  function saveName(v: string) {
    setName(v);
    try {
      if (v.trim()) localStorage.setItem(USER_NAME_KEY, v.trim());
      else localStorage.removeItem(USER_NAME_KEY);
    } catch {}
  }

  function saveAbout(v: string) {
    setAbout(v);
    try {
      if (v.trim()) localStorage.setItem(USER_ABOUT_KEY, v.trim());
      else localStorage.removeItem(USER_ABOUT_KEY);
    } catch {}
  }

  async function handleExport() {
    setBusy('export');
    try {
      const [entries, people] = await Promise.all([
        db.entries.toArray(),
        db.people.toArray(),
      ]);
      const blob = new Blob(
        [JSON.stringify({ entries, people, exportedAt: Date.now() }, null, 2)],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `folks-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setBusy('delete');
    try {
      await db.entries.clear();
      await db.people.clear();
      setConfirmDelete(false);
      setSeedResult(null);
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerateRecap() {
    setBusy('recap');
    setRecapResult(null);
    try {
      const gen = await generateWeeklyRecap({ force: true });
      if (!gen) {
        setRecapResult('skipped — need ≥3 entries in past 7 days');
        return;
      }
      await saveWeeklyRecap(gen.weekStart, gen.content);
      setRecapResult('done — check home');
    } catch (err) {
      console.error('Recap failed:', err);
      setRecapResult('failed — see console');
    } finally {
      setBusy(null);
    }
  }

  async function handleRefreshPrompts() {
    setBusy('prompts');
    setPromptsResult(null);
    try {
      const people = await db.people
        .filter((p) => !p.muted && p.entryCount >= 3)
        .toArray();
      let refreshed = 0;
      for (const p of people) {
        const r = await maybeRefreshPrompts(p.id, 'manual');
        if (r.refreshed) refreshed += 1;
      }
      setPromptsResult(
        `refreshed ${refreshed} of ${people.length} stable folks`
      );
    } catch (err) {
      console.error('Refresh prompts failed:', err);
      setPromptsResult('failed — see console');
    } finally {
      setBusy(null);
    }
  }

  async function handleSeed() {
    setBusy('seed');
    setSeedResult(null);
    try {
      const r = await seedTestData();
      setSeedResult(`added ${r.peopleAdded} people · ${r.entriesAdded} entries`);
    } catch (err) {
      console.error('Seed failed:', err);
      setSeedResult('failed — see console');
    } finally {
      setBusy(null);
    }
  }

  // ── SET flow: enter → hint → confirm → save ─────────────────────────────
  useEffect(() => {
    if (passcodeFlow === PASSCODE_FLOWS.SET_ENTER && pinNew.length === 4) {
      setPasscodeFlow(PASSCODE_FLOWS.SET_HINT);
      setPinError(null);
    }
  }, [pinNew, passcodeFlow]);

  useEffect(() => {
    if (passcodeFlow !== PASSCODE_FLOWS.SET_CONFIRM || pinNewConfirm.length !== 4) {
      return;
    }
    let cancelled = false;
    (async () => {
      if (pinNewConfirm !== pinNew) {
        setPinError("didn't match. try again.");
        setPinShake(true);
        window.setTimeout(() => {
          if (cancelled) return;
          setPinNewConfirm('');
          setPinShake(false);
        }, 320);
        return;
      }
      setBusy('pin');
      try {
        await setLockPin(pinNew, hintDraft);
        if (cancelled) return;
        setHintDraft('');
        resetFlow();
        flashToast('passcode set');
      } catch (err) {
        if (!cancelled) setPinError(err instanceof Error ? err.message : 'failed');
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pinNewConfirm, pinNew, passcodeFlow, hintDraft]);

  // ── CHANGE flow: current → new → confirm → save ─────────────────────────
  useEffect(() => {
    if (passcodeFlow !== PASSCODE_FLOWS.CHANGE_CURRENT || pinCurrent.length !== 4) {
      return;
    }
    let cancelled = false;
    (async () => {
      const ok = await verifyPin(pinCurrent);
      if (cancelled) return;
      if (ok) {
        clearFailedAttempts();
        setPinCurrent('');
        setPinError(null);
        setPasscodeFlow(PASSCODE_FLOWS.CHANGE_NEW);
      } else {
        const { rateLimited } = recordFailedAttempt();
        setPinError('incorrect passcode');
        setPinShake(true);
        window.setTimeout(() => {
          if (cancelled) return;
          setPinCurrent('');
          setPinShake(false);
          if (rateLimited) {
            // Lockout kicks in immediately; UI re-renders via ticking `now`.
            setNow(Date.now());
          }
        }, 320);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pinCurrent, passcodeFlow]);

  useEffect(() => {
    if (passcodeFlow === PASSCODE_FLOWS.CHANGE_NEW && pinNew.length === 4) {
      setPasscodeFlow(PASSCODE_FLOWS.CHANGE_CONFIRM);
      setPinError(null);
    }
  }, [pinNew, passcodeFlow]);

  useEffect(() => {
    if (
      passcodeFlow !== PASSCODE_FLOWS.CHANGE_CONFIRM ||
      pinNewConfirm.length !== 4
    ) {
      return;
    }
    let cancelled = false;
    (async () => {
      if (pinNewConfirm !== pinNew) {
        setPinError("didn't match. try again.");
        setPinShake(true);
        window.setTimeout(() => {
          if (cancelled) return;
          setPinNewConfirm('');
          setPinShake(false);
          // On mismatch, return to entering new PIN (per spec).
          setPinNew('');
          setPasscodeFlow(PASSCODE_FLOWS.CHANGE_NEW);
        }, 320);
        return;
      }
      setBusy('pin');
      try {
        await setLockPin(pinNew);
        if (cancelled) return;
        resetFlow();
        flashToast('passcode updated');
      } catch (err) {
        if (!cancelled) setPinError(err instanceof Error ? err.message : 'failed');
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pinNewConfirm, pinNew, passcodeFlow]);

  // ── REMOVE flow ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (passcodeFlow !== PASSCODE_FLOWS.REMOVE_CONFIRM || pinCurrent.length !== 4) {
      return;
    }
    let cancelled = false;
    (async () => {
      const ok = await verifyPin(pinCurrent);
      if (cancelled) return;
      if (ok) {
        clearFailedAttempts();
        clearLockPin();
        resetFlow();
        flashToast('passcode removed');
      } else {
        const { rateLimited } = recordFailedAttempt();
        setPinError('incorrect passcode');
        setPinShake(true);
        window.setTimeout(() => {
          if (cancelled) return;
          setPinCurrent('');
          setPinShake(false);
          if (rateLimited) setNow(Date.now());
        }, 320);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pinCurrent, passcodeFlow]);

  // ── Entry-point handlers ────────────────────────────────────────────────

  function startSetPin() {
    resetFlow();
    setPasscodeFlow(PASSCODE_FLOWS.SET_ENTER);
  }
  function startChangePin() {
    if (isRateLimited) return;
    resetFlow();
    setPasscodeFlow(PASSCODE_FLOWS.CHANGE_CURRENT);
  }
  function startRemovePin() {
    if (isRateLimited) return;
    resetFlow();
    setPasscodeFlow(PASSCODE_FLOWS.REMOVE_CONFIRM);
  }

  function handleLockNow() {
    lockNow();
  }

  return (
    <main className="mx-auto h-[100svh] w-full max-w-md overflow-y-auto px-4 pb-12 pt-6">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          aria-label="Back"
          className="text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
        </Link>
        <span
          className="text-[15px] italic text-ink-primary"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          settings
        </span>
        <span aria-hidden="true" style={{ width: 18 }} />
      </header>

      <div className="mt-10">
        {/* You */}
        <Section title="you">
          <div className="py-3" style={{ borderBottom: '0.5px solid var(--border-hair)' }}>
            <Label>your name</Label>
            <input
              value={name}
              onChange={(e) => saveName(e.target.value)}
              placeholder="what should we call you?"
              className="mt-1.5 w-full bg-transparent text-[14px] text-ink-primary placeholder:italic placeholder:text-ink-tertiary focus:outline-none"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            />
            <div className="mt-1.5">
              <HoverPrompt>
                only you see this. it's just a friendly greeting and a hint to the ai
                about who's writing.
              </HoverPrompt>
            </div>
          </div>
          <div className="py-3" style={{ borderBottom: '0.5px solid var(--border-hair)' }}>
            <Label>about you</Label>
            <textarea
              ref={aboutRef}
              value={about}
              onChange={(e) => saveAbout(e.target.value)}
              placeholder="a sentence or two."
              rows={1}
              className="mt-1.5 w-full resize-none overflow-hidden bg-transparent text-[14px] italic leading-snug text-ink-primary placeholder:text-ink-tertiary focus:outline-none"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            />
            <div className="mt-1.5">
              <HoverPrompt>
                context the ai keeps in mind when reading your entries — things like
                what you do, where you're based, the kind of friendships you're
                tracking, and how you process feelings.
              </HoverPrompt>
            </div>
          </div>
        </Section>

        {/* Security */}
        <Section title="security">
          <Row
            label="passcode"
            description={
              pinSet
                ? `4-digit passcode is set. status: ${
                    locked ? 'locked' : 'unlocked for this session'
                  }.`
                : 'locks your circle, entries, and journal. nothing leaves this device.'
            }
            action={
              !pinSet && passcodeFlow === PASSCODE_FLOWS.IDLE ? (
                <button
                  onClick={startSetPin}
                  className="text-[11px] uppercase tracking-widest text-accent-coral"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  set passcode →
                </button>
              ) : null
            }
          />

          {/* Change passcode */}
          {pinSet && passcodeFlow === PASSCODE_FLOWS.IDLE && (
            <Row
              label="change passcode"
              description="enter your current passcode, then choose a new one."
              action={
                <button
                  onClick={startChangePin}
                  disabled={isRateLimited}
                  className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-40"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  change →
                </button>
              }
            />
          )}

          {/* Remove passcode — destructive, coral label */}
          {pinSet && passcodeFlow === PASSCODE_FLOWS.IDLE && (
            <Row
              label={
                <span className="text-accent-coral">remove passcode</span>
              }
              description="erases the passcode. your entries stay."
              action={
                <button
                  onClick={startRemovePin}
                  disabled={isRateLimited}
                  className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-40"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  remove →
                </button>
              }
            />
          )}

          {/* Unlock mode picker */}
          {pinSet && passcodeFlow === PASSCODE_FLOWS.IDLE && (
            <Row
              label="unlock mode"
              description={
                unlockMode === 'every-time'
                  ? 'every protected screen prompts for the passcode.'
                  : 'unlock once per session. tab close or hide re-locks.'
              }
              action={
                <div
                  className="flex items-center gap-1 rounded-full px-1 py-1"
                  style={{ background: 'rgba(140, 126, 92, 0.08)' }}
                >
                  {UNLOCK_MODES.map((opt) => {
                    const active = unlockMode === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => handleUnlockModeChange(opt.value)}
                        className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-widest transition-colors"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          background: active ? 'var(--ink-primary)' : 'transparent',
                          color: active ? 'var(--bg-cream)' : 'var(--ink-secondary)',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              }
            />
          )}

          {/* Lock now */}
          {pinSet &&
            unlockMode === 'this-session' &&
            passcodeFlow === PASSCODE_FLOWS.IDLE && (
              <Row
                label="lock now"
                description={
                  unlocked
                    ? "end this session. you'll need the passcode to view content again."
                    : 'already locked. next protected screen will prompt.'
                }
                action={
                  <button
                    onClick={handleLockNow}
                    disabled={!unlocked}
                    className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-40"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    <i
                      className="ti ti-lock"
                      style={{ fontSize: 12, marginRight: 4 }}
                    />
                    lock
                  </button>
                }
              />
            )}

          {/* Rate-limit banner */}
          {isRateLimited && passcodeFlow === PASSCODE_FLOWS.IDLE && (
            <div
              className="mt-3 rounded-md px-3 py-2"
              style={{
                background: 'rgba(200, 85, 61, 0.07)',
                borderLeft: '2px solid var(--accent-coral)',
              }}
            >
              <p
                className="text-[12px] italic leading-snug"
                style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
              >
                too many attempts. try again in {lockoutRemainingSec} seconds.
              </p>
            </div>
          )}

          {/* Inline passcode flow — handles set, change, remove */}
          {passcodeFlow !== PASSCODE_FLOWS.IDLE && (
            <PasscodeFlow
              flow={passcodeFlow}
              pinCurrent={pinCurrent}
              setPinCurrent={setPinCurrent}
              pinNew={pinNew}
              setPinNew={setPinNew}
              pinNewConfirm={pinNewConfirm}
              setPinNewConfirm={setPinNewConfirm}
              pinError={pinError}
              pinShake={pinShake}
              hasSeenWarning={hasSeenWarning}
              hintDraft={hintDraft}
              setHintDraft={setHintDraft}
              onCancel={resetFlow}
              onAdvanceFromHint={() => {
                setPinError(null);
                setPasscodeFlow(PASSCODE_FLOWS.SET_CONFIRM);
              }}
              onBackToSetEnter={() => {
                setPinNew('');
                setPinNewConfirm('');
                setHintDraft('');
                setPinError(null);
                setPasscodeFlow(PASSCODE_FLOWS.SET_ENTER);
              }}
              onBackToChangeCurrent={() => {
                setPinNew('');
                setPinNewConfirm('');
                setPinError(null);
                setPasscodeFlow(PASSCODE_FLOWS.CHANGE_CURRENT);
              }}
              onBackToChangeNew={() => {
                setPinNewConfirm('');
                setPinError(null);
                setPasscodeFlow(PASSCODE_FLOWS.CHANGE_NEW);
              }}
            />
          )}

          {/* Toast (briefly visible after success) */}
          {toast && (
            <div
              className="mt-3 rounded-md px-3 py-2"
              style={{
                background: 'rgba(111, 125, 99, 0.08)',
                borderLeft: '2px solid var(--accent-sage)',
              }}
            >
              <p
                className="text-[12px] italic"
                style={{ fontFamily: 'var(--font-fraunces)' }}
              >
                {toast}
              </p>
            </div>
          )}
        </Section>

        {/* Help */}
        <Section title="help">
          <Row
            label="re-run onboarding"
            description="see the intro screens again."
            action={
              <Link
                href="/onboarding/1"
                className="text-[11px] uppercase tracking-widest text-accent-coral"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                open →
              </Link>
            }
          />
        </Section>

        {/* Data */}
        <Section title="data">
          <Row
            label="export"
            description="download a JSON file of everything you've logged."
            action={
              <button
                onClick={handleExport}
                disabled={busy !== null}
                className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-50"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {busy === 'export' ? 'exporting…' : 'download'}
              </button>
            }
          />
          <Row
            label="delete all"
            description="permanently remove every entry and person. cannot be undone."
            action={
              !confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy !== null}
                  className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  delete
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-[11px] uppercase tracking-widest text-ink-secondary"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={busy !== null}
                    className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-50"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {busy === 'delete' ? 'deleting…' : 'confirm'}
                  </button>
                </div>
              )
            }
          />
        </Section>

        {/* Developer */}
        <Section title="developer">
          <Row
            label="test parser"
            description="sandbox for trying inputs without saving them."
            action={
              <Link
                href="/test"
                className="text-[11px] uppercase tracking-widest text-accent-coral"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                open →
              </Link>
            }
          />
          <Row
            label="load test data"
            description="seeds 5 people and ~17 entries spread across the last 6 weeks."
            action={
              <div className="flex items-center gap-3">
                {seedResult && (
                  <span
                    className="text-[10px] uppercase tracking-widest text-accent-sage"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    ✓ {seedResult}
                  </span>
                )}
                <button
                  onClick={handleSeed}
                  disabled={busy !== null}
                  className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {busy === 'seed' ? 'loading…' : 'load'}
                </button>
              </div>
            }
          />
          <Row
            label="generate weekly recap now"
            description="bypasses the sunday-only gate. forces a fresh opus 4.7 recap and pins it to home."
            action={
              <div className="flex items-center gap-3">
                {recapResult && (
                  <span
                    className="text-[10px] uppercase tracking-widest text-accent-sage"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    ✓ {recapResult}
                  </span>
                )}
                <button
                  onClick={handleGenerateRecap}
                  disabled={busy !== null}
                  className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {busy === 'recap' ? 'generating…' : 'generate'}
                </button>
              </div>
            }
          />
          <Row
            label="refresh prompts for all folks"
            description="re-runs the question generator for every stable folk. skips muted and forming."
            action={
              <div className="flex items-center gap-3">
                {promptsResult && (
                  <span
                    className="text-[10px] uppercase tracking-widest text-accent-sage"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    ✓ {promptsResult}
                  </span>
                )}
                <button
                  onClick={handleRefreshPrompts}
                  disabled={busy !== null}
                  className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {busy === 'prompts' ? 'refreshing…' : 'refresh'}
                </button>
              </div>
            }
          />
        </Section>

        {/* About */}
        <Section title="about">
          <Row label="version" description="folks · all data local to this device." />
          <Row
            label="ai status"
            description={
              aiReady === null
                ? 'checking…'
                : aiReady
                  ? 'connected. entries are parsed by claude sonnet 4.6, readings by claude opus 4.7.'
                  : 'no ANTHROPIC_API_KEY in .env.local — falling back to the heuristic mock parser. restart the dev server after adding the key.'
            }
          />
          <Row
            label="privacy"
            description="what we do (and don't do) with what you write."
            action={
              <Link
                href="/privacy"
                className="text-[11px] uppercase tracking-widest text-accent-coral"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                open →
              </Link>
            }
          />
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center gap-3">
        <span
          className="text-[10px] uppercase tracking-widest text-ink-secondary"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {title}
        </span>
        <div className="h-px flex-1" style={{ background: 'var(--border-hair)' }} />
      </div>
      <div>{children}</div>
    </div>
  );
}

function HoverPrompt({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] italic text-ink-tertiary transition-colors hover:text-ink-secondary"
        style={{ fontFamily: 'var(--font-fraunces)' }}
      >
        what is this?
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-10 mt-1.5 w-[240px] rounded-md p-3 text-[11px] italic leading-snug text-ink-secondary"
          style={{
            fontFamily: 'var(--font-fraunces)',
            background: 'var(--bg-cream)',
            border: '0.5px solid var(--border-hair)',
            boxShadow: '0 4px 12px rgba(31, 26, 20, 0.06)',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] uppercase tracking-widest text-ink-tertiary"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {children}
    </span>
  );
}

function Row({
  label,
  description,
  action,
}: {
  label: React.ReactNode;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start justify-between gap-4 py-3"
      style={{ borderBottom: '0.5px solid var(--border-hair)' }}
    >
      <div className="flex-1">
        <div
          className="text-[14px] text-ink-primary"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          {label}
        </div>
        <div
          className="mt-0.5 text-[12px] italic text-ink-tertiary"
          style={{ fontFamily: 'var(--font-fraunces)' }}
        >
          {description}
        </div>
      </div>
      {action && <div className="flex-shrink-0 pt-0.5">{action}</div>}
    </div>
  );
}

// ── Passcode flow (set / change / remove inline UI) ──────────────────────────

interface PasscodeFlowProps {
  flow: PasscodeFlow;
  pinCurrent: string;
  setPinCurrent: (v: string) => void;
  pinNew: string;
  setPinNew: (v: string) => void;
  pinNewConfirm: string;
  setPinNewConfirm: (v: string) => void;
  pinError: string | null;
  pinShake: boolean;
  hasSeenWarning: boolean | null;
  hintDraft: string;
  setHintDraft: (v: string) => void;
  onCancel: () => void;
  onAdvanceFromHint: () => void;
  onBackToSetEnter: () => void;
  onBackToChangeCurrent: () => void;
  onBackToChangeNew: () => void;
}

function PasscodeFlow(props: PasscodeFlowProps) {
  const {
    flow,
    pinCurrent,
    setPinCurrent,
    pinNew,
    setPinNew,
    pinNewConfirm,
    setPinNewConfirm,
    pinError,
    pinShake,
    hasSeenWarning,
    hintDraft,
    setHintDraft,
    onCancel,
    onAdvanceFromHint,
    onBackToSetEnter,
    onBackToChangeCurrent,
    onBackToChangeNew,
  } = props;

  // Per-step config
  const config = (() => {
    switch (flow) {
      case PASSCODE_FLOWS.SET_ENTER:
        return {
          header: 'enter a new passcode',
          pinValue: pinNew,
          setPin: setPinNew,
          cancelLabel: 'cancel',
          onCancelClick: onCancel,
        };
      case PASSCODE_FLOWS.SET_CONFIRM:
        return {
          header: 're-enter to confirm',
          pinValue: pinNewConfirm,
          setPin: setPinNewConfirm,
          cancelLabel: 'back',
          onCancelClick: onBackToSetEnter,
        };
      case PASSCODE_FLOWS.CHANGE_CURRENT:
        return {
          header: 'enter current passcode',
          pinValue: pinCurrent,
          setPin: setPinCurrent,
          cancelLabel: 'cancel',
          onCancelClick: onCancel,
        };
      case PASSCODE_FLOWS.CHANGE_NEW:
        return {
          header: 'enter new passcode',
          pinValue: pinNew,
          setPin: setPinNew,
          cancelLabel: 'cancel',
          onCancelClick: onBackToChangeCurrent,
        };
      case PASSCODE_FLOWS.CHANGE_CONFIRM:
        return {
          header: 're-enter new passcode',
          pinValue: pinNewConfirm,
          setPin: setPinNewConfirm,
          cancelLabel: 'cancel',
          onCancelClick: onBackToChangeNew,
        };
      case PASSCODE_FLOWS.REMOVE_CONFIRM:
        return {
          header: 'enter current passcode to remove',
          pinValue: pinCurrent,
          setPin: setPinCurrent,
          cancelLabel: 'cancel',
          onCancelClick: onCancel,
        };
      default:
        return null;
    }
  })();

  // Hint step renders entirely different content.
  if (flow === PASSCODE_FLOWS.SET_HINT) {
    return (
      <div
        className="flex flex-col items-center py-5"
        style={{ borderBottom: '0.5px solid var(--border-hair)' }}
      >
        <div
          className="text-[10px] uppercase tracking-widest text-ink-secondary"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          hint (optional)
        </div>
        <p
          className="mt-2 max-w-[280px] text-center text-[12px] italic leading-snug"
          style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
        >
          a private reminder, shown after 3 failed unlock attempts. don't put
          your passcode here.
        </p>
        <input
          value={hintDraft}
          onChange={(e) => setHintDraft(e.target.value.slice(0, 60))}
          maxLength={60}
          placeholder="e.g. dog's birthday + reverse"
          className="mt-4 w-full max-w-[280px] bg-transparent text-center text-[14px] italic text-ink-primary placeholder:text-ink-tertiary focus:outline-none"
          style={{
            fontFamily: 'var(--font-fraunces)',
            borderBottom: '0.5px solid var(--border-hair)',
            paddingBottom: '4px',
          }}
        />
        <div className="mt-5 flex items-center gap-5">
          <button
            onClick={onBackToSetEnter}
            className="text-[10px] uppercase tracking-widest text-ink-secondary"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            back
          </button>
          <button
            onClick={onAdvanceFromHint}
            className="text-[11px] uppercase tracking-widest text-accent-coral"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {hintDraft.trim() ? 'next →' : 'skip →'}
          </button>
        </div>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div
      className="flex flex-col items-center py-5"
      style={{ borderBottom: '0.5px solid var(--border-hair)' }}
    >
      <div
        className="text-[10px] uppercase tracking-widest text-ink-secondary"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {config.header}
      </div>

      <div className={`mt-3 ${pinShake ? 'pin-shake' : ''}`}>
        <PinPad
          value={config.pinValue}
          onChange={config.setPin}
          length={4}
          error={!!pinError}
          autoFocus
        />
      </div>

      {/* First-time recovery warning. Only on initial setup, only before any
          digit, only once ever (persisted to Dexie meta). */}
      {flow === PASSCODE_FLOWS.SET_ENTER &&
        pinNew.length === 0 &&
        hasSeenWarning === false && (
          <p
            className="mt-3 max-w-[260px] text-center text-[12px] italic leading-snug"
            style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
          >
            your passcode can't be recovered. write it down somewhere.
          </p>
        )}

      {pinError && (
        <p
          className="mt-2 text-[12px] italic"
          style={{ fontFamily: 'var(--font-fraunces)', color: '#8C7E5C' }}
        >
          {pinError}
        </p>
      )}

      <button
        onClick={config.onCancelClick}
        className="mt-3 text-[10px] uppercase tracking-widest text-ink-secondary"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {config.cancelLabel}
      </button>
    </div>
  );
}
