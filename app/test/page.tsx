'use client';

import { useState } from 'react';
import Link from 'next/link';
import { parseEntry, type ParserEngine } from '@/lib/ai';
import type { ParseResponse } from '@/types';

interface TestResult {
  id: number;
  input: string;
  parsed: ParseResponse;
  engine: ParserEngine;
  ranAt: number;
}

const SUGGESTIONS = [
  'Just went to Coupa with Alex',
  'Bro fran just got here',
  'Had coffee with Maya, she was really present',
  'Saw Ravi at the conference today',
  'Hung out with Alex and Ravi',
  'Talked to Sam tonight',
  'Jordan complained the whole dinner',
  'Studied alone at the cafe',
  'Long run in the morning',
];

export default function TestPage() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<TestResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counterRef = useState({ n: 0 })[0];

  async function handleParse(text?: string) {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { parsed, engine } = await parseEntry(t);
      counterRef.n += 1;
      setHistory((h) => [
        { id: counterRef.n, input: t, parsed, engine, ranAt: Date.now() },
        ...h,
      ]);
      if (!text) setInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'parse failed');
    } finally {
      setBusy(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleParse();
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-12 pt-6">
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
          test parser
        </span>
        <button
          onClick={() => setHistory([])}
          disabled={history.length === 0}
          aria-label="Clear history"
          className="text-[10px] uppercase tracking-widest text-ink-secondary transition-colors hover:text-ink-primary disabled:opacity-40"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          clear
        </button>
      </header>

      <p
        className="mt-6 text-[13px] italic leading-snug text-ink-secondary"
        style={{ fontFamily: 'var(--font-fraunces)' }}
      >
        type any phrase. the parser runs on it without saving anything to
        your journal. results stack below — most recent on top.
      </p>

      {/* Input */}
      <div className="mt-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="e.g. just went to coupa with alex…"
          rows={3}
          className="w-full resize-none rounded-md border bg-white/40 px-4 py-3 text-[14px] leading-relaxed text-ink-primary placeholder:italic placeholder:text-ink-tertiary focus:outline-none"
          style={{
            fontFamily: 'var(--font-fraunces)',
            borderColor: 'var(--border-hair)',
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <span
            className="text-[10px] uppercase tracking-widest text-ink-tertiary"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            ⌘+enter to parse
          </span>
          <button
            onClick={() => handleParse()}
            disabled={!input.trim() || busy}
            className="text-[11px] uppercase tracking-widest text-accent-coral disabled:opacity-40"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {busy ? 'parsing…' : 'parse →'}
          </button>
        </div>
        {error && (
          <div
            className="mt-2 rounded-md px-3 py-2 text-[12px] italic"
            style={{
              background: 'rgba(200, 85, 61, 0.08)',
              borderLeft: '2px solid var(--accent-coral)',
              fontFamily: 'var(--font-fraunces)',
              color: 'var(--ink-primary)',
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Suggested inputs */}
      <div className="mt-6">
        <div
          className="mb-2 text-[10px] uppercase tracking-widest text-ink-secondary"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          try one
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleParse(s)}
              disabled={busy}
              className="rounded-full border px-2.5 py-1 text-[11px] italic text-ink-secondary transition-opacity hover:opacity-70 disabled:opacity-40"
              style={{
                borderColor: 'var(--border-hair)',
                fontFamily: 'var(--font-fraunces)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {history.length > 0 && (
        <div className="mt-10">
          <div className="mb-2 flex items-center gap-3">
            <span
              className="text-[10px] uppercase tracking-widest text-ink-secondary"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              results · {history.length}
            </span>
            <div className="h-px flex-1" style={{ background: 'var(--border-hair)' }} />
          </div>
          {history.map((r) => (
            <ResultCard key={r.id} result={r} />
          ))}
        </div>
      )}
    </main>
  );
}

function ResultCard({ result }: { result: TestResult }) {
  const { parsed, engine, input } = result;

  return (
    <div
      className="mt-3 rounded-md px-4 py-3"
      style={{
        background: 'rgba(140, 126, 92, 0.05)',
        border: '0.5px solid var(--border-hair)',
      }}
    >
      <p
        className="text-[14px] italic leading-snug text-ink-primary"
        style={{ fontFamily: 'var(--font-fraunces)' }}
      >
        "{input}"
      </p>

      <div className="mt-3 space-y-1.5">
        <Field
          label="attribution"
          value={
            parsed.is_solo || !parsed.primary_person ? (
              <em className="text-ink-secondary">solo</em>
            ) : (
              <span>
                <strong style={{ color: 'var(--accent-coral)' }}>
                  {parsed.primary_person}
                </strong>
                {parsed.is_new_person && (
                  <span className="ml-1 text-[10px] italic text-ink-tertiary">
                    (new)
                  </span>
                )}
              </span>
            )
          }
        />
        {parsed.additional_people.length > 0 && (
          <Field
            label="also mentioned"
            value={parsed.additional_people.join(', ')}
          />
        )}
        <Field label="sentiment" value={`${parsed.sentiment} / 10`} />
        <Field
          label="tags"
          value={
            parsed.tags.length > 0 ? (
              parsed.tags.join(' · ')
            ) : (
              <em className="text-ink-tertiary">none</em>
            )
          }
        />
        {parsed.context_summary && (
          <Field
            label="context"
            value={
              <em className="text-ink-secondary">{parsed.context_summary}</em>
            }
          />
        )}
      </div>

      <div
        className="mt-3 flex items-center justify-between border-t pt-2 text-[10px] uppercase tracking-widest text-ink-tertiary"
        style={{
          fontFamily: 'var(--font-mono)',
          borderColor: 'var(--border-hair)',
        }}
      >
        <span>{engine === 'mock' ? 'mock parser' : 'claude sonnet'}</span>
        <span>{Math.round(parsed.confidence * 100)}% confident</span>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span
        className="w-[100px] flex-shrink-0 text-[10px] uppercase tracking-widest text-ink-tertiary"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {label}
      </span>
      <span
        className="flex-1 text-[13px] text-ink-primary"
        style={{ fontFamily: 'var(--font-fraunces)' }}
      >
        {value}
      </span>
    </div>
  );
}
