'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { saveEntry } from '@/lib/save-entry';

const CORAL = '#C8553D';
const INK = '#1F1A14';
const TAN = '#B4A689';
const INK_MUTED = '#5A5347';
const FONT_SERIF = 'Georgia, serif';
const FONT_MONO = 'JetBrains Mono, monospace';

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Manual entry — skips the chat AI surface entirely. Write text, tap save,
 * entry lands directly in the journal. For users who want to log something
 * fast without a conversation.
 */
export default function WriteScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = setTimeout(() => textareaRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, []);

  // Auto-grow so the box extends as the user writes.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 24)}px`;
  }, [text]);

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await saveEntry(trimmed);
    } catch (err) {
      console.error('manual-entry save failed:', err);
    } finally {
      setSaving(false);
      router.push('/journal');
    }
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="relative h-full w-full overflow-hidden"
    >
      {/* X cancel — top-left, returns to home without saving */}
      <button
        onClick={() => router.push('/')}
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

      {/* Date header, same hero treatment as home + chat */}
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
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        {formatDate()}
      </div>

      {/* Label */}
      <div
        className="absolute inset-x-0 text-center"
        style={{
          top: 70,
          fontFamily: FONT_MONO,
          fontSize: 10,
          color: TAN,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        new entry
      </div>

      {/* Writing area — full height between header and bottom button */}
      <div
        className="absolute"
        style={{ left: 16, right: 16, top: 110, bottom: 100 }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="what happened?"
          autoFocus
          className="italic"
          style={{
            display: 'block',
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

      {/* Save pill at the bottom */}
      <button
        onClick={handleSave}
        disabled={saving || !text.trim()}
        className="absolute active:scale-[0.97] transition-transform"
        style={{
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 28,
          width: 220,
          height: 46,
          borderRadius: 23,
          background: CORAL,
          border: 'none',
          opacity: !text.trim() ? 0.4 : 1,
        }}
      >
        <span
          className="italic"
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 14,
            color: '#FAF7F0',
          }}
        >
          {saving ? 'saving…' : 'send to journal'}
        </span>
      </button>

      {/* Mark we're not on chat — small label so user knows AI didn't see this */}
      <div
        className="absolute inset-x-0 text-center italic"
        style={{
          bottom: 84,
          fontFamily: FONT_SERIF,
          fontSize: 11,
          color: INK_MUTED,
        }}
      >
        going straight to your journal — no ai involved
      </div>
    </motion.main>
  );
}
