/**
 * Passcode gate for folks.
 *
 * Hash format: PBKDF2-SHA-256, 100k iterations, 16-byte random salt.
 * Stored in localStorage.
 *
 * Unlock model: two modes only.
 *  - 'every-time'  → isUnlocked() always false; every protected screen prompts
 *  - 'this-session' → session-scoped unlock; lock() fires on tab hidden
 *
 * No idle timer, no activity tracking — backgrounding the tab re-locks.
 */

import { useEffect, useState } from 'react';

// ── Storage keys ─────────────────────────────────────────────────────────────
const PIN_HASH_KEY = 'folks_lock_pin_hash';
const PIN_SALT_KEY = 'folks_lock_pin_salt';
const PIN_HINT_KEY = 'folks_lock_pin_hint';
const UNLOCK_MODE_KEY = 'folks_passcode_mode';
const SESSION_UNLOCKED_KEY = 'folks_passcode_unlocked';

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const HINT_MAX_LENGTH = 60;

// ── Event bus for same-tab reactivity ────────────────────────────────────────
const lockEvents =
  typeof window !== 'undefined' ? new EventTarget() : null;
function emitChange() {
  lockEvents?.dispatchEvent(new Event('change'));
}

// ── Unlock mode ──────────────────────────────────────────────────────────────

export type UnlockMode = 'every-time' | 'this-session';

export interface UnlockModeOption {
  value: UnlockMode;
  label: string;
}

/** Pill options for the settings screen, in display order. */
export const UNLOCK_MODES: UnlockModeOption[] = [
  { value: 'every-time', label: 'every time' },
  { value: 'this-session', label: 'this session' },
];

export function getUnlockMode(): UnlockMode {
  try {
    const v = localStorage.getItem(UNLOCK_MODE_KEY);
    return v === 'every-time' ? 'every-time' : 'this-session';
  } catch {
    return 'this-session';
  }
}

export function setUnlockMode(mode: UnlockMode): void {
  try {
    localStorage.setItem(UNLOCK_MODE_KEY, mode);
  } catch {}
  emitChange();
}

// ── Hashing ──────────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function deriveHash(pin: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      // TS 5+ is picky about Uint8Array<ArrayBufferLike> vs ArrayBufferView<ArrayBuffer>.
      // Runtime is fine — Uint8Array satisfies BufferSource.
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_BITS
  );
  return bytesToHex(new Uint8Array(derived));
}

// ── PIN management ───────────────────────────────────────────────────────────

export function hasLockPin(): boolean {
  try {
    return (
      localStorage.getItem(PIN_HASH_KEY) !== null &&
      localStorage.getItem(PIN_SALT_KEY) !== null
    );
  } catch {
    return false;
  }
}

export async function setLockPin(pin: string, hint?: string): Promise<void> {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits');
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveHash(pin, salt);
  localStorage.setItem(PIN_HASH_KEY, hash);
  localStorage.setItem(PIN_SALT_KEY, bytesToHex(salt));
  if (hint !== undefined) setHint(hint);
  setUnlocked();
  emitChange();
}

export function clearLockPin(): void {
  try {
    localStorage.removeItem(PIN_HASH_KEY);
    localStorage.removeItem(PIN_SALT_KEY);
    localStorage.removeItem(PIN_HINT_KEY);
    localStorage.removeItem(UNLOCK_MODE_KEY);
    sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
  } catch {}
  emitChange();
}

export async function verifyPin(pin: string): Promise<boolean> {
  try {
    const storedHash = localStorage.getItem(PIN_HASH_KEY);
    const storedSalt = localStorage.getItem(PIN_SALT_KEY);
    if (!storedHash || !storedSalt) {
      console.warn('[folks.verifyPin] no stored hash or salt', {
        hashPresent: !!storedHash,
        saltPresent: !!storedSalt,
      });
      return false;
    }
    if (storedSalt.length !== SALT_BYTES * 2) {
      console.warn('[folks.verifyPin] salt length unexpected', {
        actual: storedSalt.length,
        expected: SALT_BYTES * 2,
      });
    }
    const hash = await deriveHash(pin, hexToBytes(storedSalt));
    const match = hash === storedHash;
    if (!match) {
      console.warn('[folks.verifyPin] hash mismatch', {
        pinLength: pin.length,
        computedHashPrefix: hash.slice(0, 12) + '…',
        storedHashPrefix: storedHash.slice(0, 12) + '…',
        saltPrefix: storedSalt.slice(0, 12) + '…',
        iterations: PBKDF2_ITERATIONS,
      });
    } else {
      console.log('[folks.verifyPin] match ✓');
    }
    return match;
  } catch (err) {
    console.error('[folks.verifyPin] error', err);
    return false;
  }
}

// ── Hint ─────────────────────────────────────────────────────────────────────

export function getHint(): string | null {
  try {
    return localStorage.getItem(PIN_HINT_KEY);
  } catch {
    return null;
  }
}

export function setHint(hint: string): void {
  try {
    const trimmed = hint.trim();
    if (trimmed.length === 0) {
      localStorage.removeItem(PIN_HINT_KEY);
    } else {
      localStorage.setItem(PIN_HINT_KEY, trimmed.slice(0, HINT_MAX_LENGTH));
    }
  } catch {}
  emitChange();
}

// ── Unlock state ─────────────────────────────────────────────────────────────

export function isUnlocked(): boolean {
  try {
    // 'every-time' mode never persists an unlock across surfaces — each
    // protected screen prompts. Successful entry on a LockScreen is consumed
    // locally by the parent's onUnlock state, not by this flag.
    if (getUnlockMode() === 'every-time') return false;
    return sessionStorage.getItem(SESSION_UNLOCKED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setUnlocked(): void {
  try {
    sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
  } catch {}
  emitChange();
}

export function lock(): void {
  try {
    sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
  } catch {}
  emitChange();
}

// ── React hook ───────────────────────────────────────────────────────────────

export interface LockState {
  pinSet: boolean;
  unlocked: boolean;
  locked: boolean; // pinSet && !unlocked
}

export function useLockState(): LockState {
  const [state, setState] = useState<LockState>({
    pinSet: false,
    unlocked: false,
    locked: false,
  });

  useEffect(() => {
    const update = () => {
      const pinSet = hasLockPin();
      const unlocked = isUnlocked();
      setState({ pinSet, unlocked, locked: pinSet && !unlocked });
    };
    update();
    lockEvents?.addEventListener('change', update);
    window.addEventListener('storage', update);
    window.addEventListener('focus', update);
    return () => {
      lockEvents?.removeEventListener('change', update);
      window.removeEventListener('storage', update);
      window.removeEventListener('focus', update);
    };
  }, []);

  return state;
}
