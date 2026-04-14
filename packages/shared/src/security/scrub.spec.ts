import { describe, it, expect } from 'vitest';
import { scrubSecrets, scrubDeep, REDACTED_PLACEHOLDER } from './scrub.js';

const R = REDACTED_PLACEHOLDER;

describe('scrubSecrets — pattern detection', () => {
  it('redacts OpenAI API keys', () => {
    const out = scrubSecrets('use key sk-abcdef0123456789ABCDEF here');
    expect(out).toBe(`use key ${R} here`);
  });

  it('redacts Bearer tokens while preserving leading whitespace', () => {
    const out = scrubSecrets('Authorization: Bearer eyJhbGciOi.JIUzI1NiJ9.sigpart');
    // Bearer is preceded by a space → the space is preserved, token replaced.
    expect(out).toBe(`Authorization:${' '}${R}`);
  });

  it('redacts AWS access keys', () => {
    const out = scrubSecrets('key=AKIAIOSFODNN7EXAMPLE tail');
    expect(out).toBe(`key=${R} tail`);
  });

  it('redacts Gemini API keys', () => {
    const key = 'AIza' + 'A'.repeat(35);
    const out = scrubSecrets(`GEMINI=${key}`);
    expect(out).toBe(`GEMINI=${R}`);
  });

  it('redacts JWTs (3-part)', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const out = scrubSecrets(`token=${jwt}`);
    expect(out).toBe(`token=${R}`);
  });

  it('redacts PEM blocks', () => {
    const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA7...
abcdef
-----END RSA PRIVATE KEY-----`;
    const out = scrubSecrets(`pre\n${pem}\npost`);
    expect(out).toBe(`pre\n${R}\npost`);
  });

  it('redacts Wing session cookies (case insensitive)', () => {
    const out = scrubSecrets('Cookie: WING_SESSION=abc123DEF_-; other=1');
    expect(out.startsWith('Cookie: ')).toBe(true);
    expect(out).toContain(R);
    expect(out).not.toContain('abc123DEF');
  });

  it('redacts Basic auth headers', () => {
    const basic = 'Basic ' + 'A'.repeat(40);
    const out = scrubSecrets(`auth=${basic}`);
    expect(out).toBe(`auth=${R}`);
  });

  it('redacts multiple patterns in a single string', () => {
    const input = `sk-abcdef0123456789ABCDEFG AKIAIOSFODNN7EXAMPLE  Bearer tokentoken123`;
    const out = scrubSecrets(input);
    expect(out).not.toContain('sk-abcdef');
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(out).not.toContain('tokentoken123');
    // Three redactions present
    const count = (out.match(/\[REDACTED\]/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

describe('scrubSecrets — false positive avoidance', () => {
  it('does not touch the phrase "API key" in prose', () => {
    const s = 'API key 사용법 안내 문서';
    expect(scrubSecrets(s)).toBe(s);
  });

  it('does not touch natural language with "password"', () => {
    const s = 'password 를 안전하게 관리하세요';
    expect(scrubSecrets(s)).toBe(s);
  });

  it('does not touch incomplete JWT-looking strings', () => {
    const s = 'eyJ is a prefix of base64';
    expect(scrubSecrets(s)).toBe(s);
  });

  it('does not touch "Bearer" when no token follows', () => {
    const s = 'Bearer 에 대한 설명';
    expect(scrubSecrets(s)).toBe(s);
  });

  it('returns empty string unchanged', () => {
    expect(scrubSecrets('')).toBe('');
  });
});

describe('scrubDeep — nested structures', () => {
  it('redacts sensitive field keys wholesale, regardless of content', () => {
    const out = scrubDeep({
      username: 'alice',
      password: 'not-a-secret-looking-value',
      apiKey: '1234',
    });
    expect(out).toEqual({
      username: 'alice',
      password: R,
      apiKey: R,
    });
  });

  it('matches field keys case-insensitively', () => {
    const out = scrubDeep({ Authorization: 'whatever', COOKIE: 'x', Access_Token: 'y' });
    expect(out).toEqual({ Authorization: R, COOKIE: R, Access_Token: R });
  });

  it('scrubs strings inside nested objects and headers', () => {
    const input = {
      headers: {
        Authorization: 'Bearer xxx',
        'x-api-key': 'sk-abcdef0123456789ABCDEFG',
      },
      body: 'Gemini: AIza' + 'B'.repeat(35),
    };
    const out = scrubDeep(input) as typeof input;
    // Authorization key matches sensitive field → whole value redacted
    expect(out.headers.Authorization).toBe(R);
    // 'x-api-key' is NOT in the sensitive key set (key name diverges), so the
    // value is scrubbed via pattern matching (starts with sk-).
    expect(out.headers['x-api-key']).toBe(R);
    expect(out.body).toBe(`Gemini: ${R}`);
  });

  it('scrubs strings inside arrays of objects', () => {
    const out = scrubDeep([
      { token: 'abc', name: 'safe' },
      { note: 'AKIAIOSFODNN7EXAMPLE is a key' },
    ]);
    expect(out).toEqual([
      { token: R, name: 'safe' },
      { note: `${R} is a key` },
    ]);
  });

  it('leaves null, undefined, numbers, booleans, and empty values unchanged', () => {
    expect(scrubDeep(null)).toBeNull();
    expect(scrubDeep(undefined)).toBeUndefined();
    expect(scrubDeep(42)).toBe(42);
    expect(scrubDeep(true)).toBe(true);
    expect(scrubDeep('')).toBe('');
    expect(scrubDeep({})).toEqual({});
    expect(scrubDeep([])).toEqual([]);
  });

  it('leaves Date objects untouched', () => {
    const now = new Date('2026-04-13T00:00:00Z');
    const out = scrubDeep({ at: now, password: 'x' }) as { at: Date; password: string };
    expect(out.at).toBe(now);
    expect(out.password).toBe(R);
  });

  it('handles circular references without throwing', () => {
    const a: Record<string, unknown> = { name: 'root' };
    a.self = a;
    const out = scrubDeep(a) as Record<string, unknown>;
    expect(out.name).toBe('root');
    expect(out.self).toBe('[CIRCULAR]');
  });
});
