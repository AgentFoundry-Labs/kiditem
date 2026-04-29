import { describe, it, expect } from 'vitest';

import {
  REDACTED_PLACEHOLDER,
  scrubExecutionError,
} from '../ad-execution-error-scrubber';

/**
 * Worker-reported error strings end up persisted on `ExecutionTask` and
 * `AdAction` rows and are returned to clients. Each pattern below has been
 * triggered by a real worker error in the past or is a known leak shape.
 * Regressions on any of these would re-introduce a credential disclosure
 * path through the report endpoint.
 */
describe('scrubExecutionError', () => {
  it('returns the input unchanged when no patterns match', () => {
    expect(scrubExecutionError('plain error message')).toBe('plain error message');
  });

  it('handles empty input safely', () => {
    expect(scrubExecutionError('')).toBe('');
  });

  it('redacts OpenAI API keys (sk-…)', () => {
    const out = scrubExecutionError('connection refused for sk-AbCdEfGh1234567890XYZ');
    expect(out).toBe(`connection refused for ${REDACTED_PLACEHOLDER}`);
  });

  it('redacts AWS access keys', () => {
    const out = scrubExecutionError('aws denied AKIAABCDEFGHIJKLMNOP');
    expect(out).toBe(`aws denied ${REDACTED_PLACEHOLDER}`);
  });

  it('redacts Gemini API keys (AIza…)', () => {
    // Pattern requires exactly 35 chars after the AIza prefix.
    const out = scrubExecutionError('gemini call failed AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ_123456');
    expect(out).toBe(`gemini call failed ${REDACTED_PLACEHOLDER}`);
  });

  it('redacts JWTs (eyJ…)', () => {
    const out = scrubExecutionError(
      'invalid token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.signature_abc',
    );
    expect(out).toBe(`invalid token ${REDACTED_PLACEHOLDER}`);
  });

  it('redacts bearer tokens while keeping the leading whitespace anchor', () => {
    const out = scrubExecutionError('http error Bearer abc.def-123');
    expect(out).toBe(`http error ${REDACTED_PLACEHOLDER}`);
  });

  it('redacts Wing session cookies', () => {
    const out = scrubExecutionError('cookie WINGADMINSESSIONabc123==');
    expect(out).toBe(`cookie ${REDACTED_PLACEHOLDER}`);
  });

  it('redacts Basic auth blobs', () => {
    const out = scrubExecutionError('auth header Basic dXNlcjpwYXNzd29yZHN1cGVyc2VjcmV0');
    expect(out).toBe(`auth header ${REDACTED_PLACEHOLDER}`);
  });

  it('redacts PEM blocks across newlines', () => {
    const out = scrubExecutionError(
      'tls failed -----BEGIN PRIVATE KEY-----\nMIIBIjANBgkqhk...\n-----END PRIVATE KEY-----',
    );
    expect(out).toBe(`tls failed ${REDACTED_PLACEHOLDER}`);
  });
});
