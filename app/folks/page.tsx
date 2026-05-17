'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { hasLockPin, isUnlocked } from '@/lib/lock';
import { LockScreen } from '@/components/lock-screen';
import type { Person } from '@/types';

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function relativeDate(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function toneFor(avg: number, count: number): string {
  if (count === 0) return '—';
  if (avg >= 7) return 'warm';
  if (avg >= 5.5) return 'mixed-warm';
  if (avg >= 4) return 'mixed-heavy';
  return 'heavy';
}

export default function FolksPage() {
  return <FolksGate />;
}

function FolksGate() {
  const [unlocked, setUnlockedState] = useState(false);
  const [gateChecked, setGateChecked] = useState(false);
  useEffect(() => {
    if (hasLockPin() && !isUnlocked()) setUnlockedState(false);
    else setUnlockedState(true);
    setGateChecked(true);
  }, []);

  if (!gateChecked) {
    return <main className="mx-auto h-[100svh] w-full max-w-md" />;
  }
  if (!unlocked) {
    return (
      <LockScreen
        title="your folks is locked"
        onUnlock={() => setUnlockedState(true)}
      />
    );
  }
  return <FolksList />;
}

function FolksList() {
  const router = useRouter();
  // Sort by most-recently-active first so the people the user is currently
  // venting about land at the top.
  const people: Person[] =
    useLiveQuery(async () => {
      const arr = await db.people.filter((p) => !p.muted).toArray();
      return arr.sort((a, b) => b.lastInteraction - a.lastInteraction);
    }, []) ?? [];

  return (
    <main className="mx-auto flex h-[100svh] w-full max-w-md flex-col overflow-hidden px-4 pt-6">
      <header className="flex flex-shrink-0 items-center justify-between">
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
          your folks
        </span>
        <Link
          href="/settings"
          aria-label="Settings"
          className="text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <i className="ti ti-settings" style={{ fontSize: 18 }} />
        </Link>
      </header>

      <div className="-mx-4 flex-1 overflow-y-auto px-4 pb-12 pt-8">
        {people.length === 0 ? (
          <div className="py-16 text-center">
            <p
              className="text-[14px] italic text-ink-tertiary"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              no folks yet.
            </p>
            <p
              className="mt-2 text-[12px] italic text-ink-tertiary"
              style={{ fontFamily: 'var(--font-fraunces)' }}
            >
              write a few entries — people you mention land here.
            </p>
          </div>
        ) : (
          <ul>
            {people.map((p) => (
              <li
                key={p.id}
                style={{ borderBottom: '0.5px solid var(--border-hair)' }}
              >
                <button
                  onClick={() => router.push(`/person/${p.id}`)}
                  className="flex w-full items-center gap-3 py-4 text-left transition-opacity hover:opacity-70"
                >
                  <div
                    className="flex flex-shrink-0 items-center justify-center"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      border: '0.5px solid var(--border-hair)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-fraunces)',
                        fontSize: 16,
                        fontWeight: 500,
                        color: 'var(--ink-primary)',
                      }}
                    >
                      {monogram(p.name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[16px] italic text-ink-primary"
                      style={{ fontFamily: 'var(--font-fraunces)' }}
                    >
                      {p.name}
                    </div>
                    <div
                      className="mt-0.5 truncate"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--ink-tertiary)',
                      }}
                    >
                      {toneFor(p.avgSentiment, p.entryCount)} ·{' '}
                      {p.entryCount}{' '}
                      {p.entryCount === 1 ? 'entry' : 'entries'} · last{' '}
                      {relativeDate(p.lastInteraction)}
                    </div>
                  </div>
                  <span
                    aria-hidden="true"
                    className="text-ink-tertiary"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}
                  >
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
