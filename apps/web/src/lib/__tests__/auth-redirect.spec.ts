import { describe, expect, it } from 'vitest';
import { sanitizeInternalRedirectPath } from '../auth-redirect';

describe('sanitizeInternalRedirectPath', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/dashboard?tab=ops#ready', '/dashboard?tab=ops#ready'],
    [' /agent-os ', '/agent-os'],
    ['', '/'],
    [null, '/'],
    ['https://evil.example/path', '/'],
    ['//evil.example/path', '/'],
    ['javascript:alert(1)', '/'],
    ['/\\evil.example/path', '/'],
    ['/dashboard\njavascript:alert(1)', '/'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(sanitizeInternalRedirectPath(input)).toBe(expected);
  });
});
