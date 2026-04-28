import { SECRET_PATTERNS, SENSITIVE_FIELD_KEYS } from './patterns.js';

export const REDACTED_PLACEHOLDER = '[REDACTED]';
const CIRCULAR_PLACEHOLDER = '[CIRCULAR]';

/**
 * Remove known secret shapes from a string (API keys, Bearer tokens, PEM
 * blocks, etc.). Non-matching text is returned untouched, so callers can apply
 * this to free-form log lines without fear of clobbering normal content.
 */
export function scrubSecrets(input: string): string {
  if (!input) return input;
  let out = input;
  for (const { re, name } of SECRET_PATTERNS) {
    // Some patterns (bearer_token, wing_cookie, basic_auth) intentionally
    // capture a leading whitespace character so we only match real occurrences.
    // Preserve that whitespace by detecting it during replacement.
    out = out.replace(re, (match) => {
      if (name === 'bearer_token') {
        const lead = match.match(/^\s/)?.[0] ?? '';
        return `${lead}${REDACTED_PLACEHOLDER}`;
      }
      return REDACTED_PLACEHOLDER;
    });
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively walk a value and redact secrets:
 * - string leaves go through `scrubSecrets`
 * - plain-object values keyed by a sensitive field name are replaced wholesale
 * - arrays are mapped element-wise
 * - non-plain objects (Date, RegExp, class instances, Buffer, ...) pass through
 * - circular references are replaced with `[CIRCULAR]` (never throws)
 */
export function scrubDeep<T>(input: T): T {
  const seen = new WeakSet<object>();
  return walk(input, seen) as T;
}

function walk(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'string') return scrubSecrets(value as string);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return value;
  if (t === 'function' || t === 'symbol') return value;

  if (Array.isArray(value)) {
    if (seen.has(value)) return CIRCULAR_PLACEHOLDER;
    seen.add(value);
    return value.map((item) => walk(item, seen));
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) return CIRCULAR_PLACEHOLDER;
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_FIELD_KEYS.has(key.toLowerCase())) {
        out[key] = REDACTED_PLACEHOLDER;
      } else {
        out[key] = walk(val, seen);
      }
    }
    return out;
  }

  // Non-plain objects (Date, RegExp, Buffer, class instances, Map, Set, ...):
  // leave untouched — scrubbing opaque structures risks corrupting behaviour.
  return value;
}
