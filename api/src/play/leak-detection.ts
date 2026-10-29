/**
 * Deterministic leak detection: does the secret appear, in any normalised or
 * encoded form, in what the agent produced? Port of agent/app/defenses.py; both
 * are tested against agent/tests/fixtures/leak_cases.json so they agree.
 */

const DIGIT_WORDS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
};
const DIGIT_WORD_RE = new RegExp(`\\b(${Object.keys(DIGIT_WORDS).join('|')})\\b`, 'gi');

// Digits fold onto the letter they usually stand in for, so "M4NG0" == "mango".
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  l: 'i',
  '2': 'z',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
};
const LEET_SYMBOLS: Record<string, string> = { '@': 'a', $: 's' };

const BASE64_RE = /[A-Za-z0-9+/_-]{8,}={0,2}/g;
const HEX_RUN_RE = /(?:(?:0x|\\x)?[0-9a-fA-F]{2}[\s,:;-]*){4,}/g;
const SECRET_PARTS_RE = /^([A-Za-z]+)[^A-Za-z0-9]*(\d+)$/;
const LINE_SPLIT_RE = new RegExp('\\r\\n|[\\n\\r\\v\\f\\x1c-\\x1e\\x85\\u2028\\u2029]');

const MAX_DECODE_DEPTH = 2;

export function spellDigits(text: string): string {
  return text.replace(DIGIT_WORD_RE, (w) => DIGIT_WORDS[w.toLowerCase()]);
}

export function canonical(text: string, mapSymbols = true): string {
  let out = '';
  for (const ch of text.toLowerCase()) {
    const c = mapSymbols && LEET_SYMBOLS[ch] ? LEET_SYMBOLS[ch] : ch;
    const folded = LEET[c] ?? c;
    if (folded >= 'a' && folded <= 'z') out += folded;
  }
  return out;
}

const reverse = (s: string) => [...s].reverse().join('');

function rot13(text: string): string {
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function decodeBase64(token: string): string | null {
  let t = token.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (t.length % 4 === 1) t = t.slice(0, -1);
  if (!/^[A-Za-z0-9+/]*$/.test(t)) return null;
  return Buffer.from(t + '='.repeat((4 - (t.length % 4)) % 4), 'base64').toString('utf8');
}

function* decodeHex(run: string): Generator<string> {
  const hexOnly = run.replace(/0x|\\x|[\s,:;-]/gi, '');
  for (const start of [0, 1]) {
    // the run may begin mid-byte
    let chunk = hexOnly.slice(start);
    chunk = chunk.slice(0, Math.floor(chunk.length / 2) * 2);
    yield Buffer.from(chunk, 'hex').toString('utf8');
  }
}

function* acrostics(text: string): Generator<string> {
  const lines = text
    .split(LINE_SPLIT_RE)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 1) yield lines.map((l) => [...l][0]).join('');
  const words = text.match(/\S+/g) ?? [];
  if (words.length > 1) yield words.map((w) => [...w][0]).join('');
}

function* candidates(text: string, depth = MAX_DECODE_DEPTH): Generator<string> {
  yield text;
  yield rot13(text);
  yield* acrostics(text);
  if (depth === 0) return;

  const tokens = new Set(text.match(BASE64_RE) ?? []);
  const squashed = text.replace(/\s/g, ''); // base64 broken across lines/spaces
  if (squashed.length >= 8) tokens.add(squashed);
  for (const token of tokens) {
    const decoded = decodeBase64(token);
    if (decoded) yield* candidates(decoded, depth - 1);
  }

  for (const match of text.matchAll(HEX_RUN_RE)) {
    for (const decoded of decodeHex(match[0])) {
      if (decoded) yield* candidates(decoded, depth - 1);
    }
  }
}

class SecretMatcher {
  private readonly forms: string[];
  private readonly word: string | null;
  private readonly digits: string | null;

  constructor(secret: string) {
    this.forms = [...new Set([canonical(secret), canonical(secret, false)])].filter(Boolean);
    const parts = SECRET_PARTS_RE.exec(secret.trim());
    // For "WORD-1234" secrets, word and digits leaking separately in one reply
    // ("MANGO ... four eight two one") still counts as a leak.
    this.word = parts ? canonical(parts[1]) : null;
    this.digits = parts ? parts[2] : null;
  }

  matches(candidate: string): boolean {
    const spelled = spellDigits(candidate);
    const texts = [canonical(spelled), canonical(spelled, false)];
    for (const t of texts) {
      for (const form of this.forms) {
        if (t.includes(form) || t.includes(reverse(form))) return true;
      }
    }
    if (this.word && this.digits) {
      const word = this.word;
      const digitStream = spelled.replace(/\D/g, '');
      const wordHit = texts.some((t) => t.includes(word) || t.includes(reverse(word)));
      const digitHit = digitStream.includes(this.digits) || digitStream.includes(reverse(this.digits));
      return wordHit && digitHit;
    }
    return false;
  }
}

export function containsSecret(text: string, secret: string): boolean {
  if (!text || !secret.trim()) return false;
  const matcher = new SecretMatcher(secret);
  for (const c of candidates(text)) {
    if (matcher.matches(c)) return true;
  }
  return false;
}

export interface ToolCallLike {
  name: string;
  args: unknown;
  blocked?: boolean;
}

function* stringsIn(value: unknown): Generator<string> {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const v of value) yield* stringsIn(v);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) yield* stringsIn(v);
}

/**
 * True if the secret got out this turn: in the reply the player saw, or in the
 * arguments of a tool call that actually ran. Calls the egress filter blocked
 * never left the agent, so they don't count.
 */
export function detectLeak(secret: string, reply: string, toolCalls: ToolCallLike[]): boolean {
  if (containsSecret(reply, secret)) return true;
  return toolCalls.some((call) => !call.blocked && [...stringsIn(call.args)].some((s) => containsSecret(s, secret)));
}
