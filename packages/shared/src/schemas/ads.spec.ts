import { describe, expect, it } from 'vitest';
import { AdExtensionReplayIdempotencyKeySchema } from './ads';

describe('AdExtensionReplayIdempotencyKeySchema', () => {
  it('accepts the bounded authoritative replay key and rejects arbitrary tokens', () => {
    expect(AdExtensionReplayIdempotencyKeySchema.parse(
      'authoritative-rebuild:12345:550e8400-e29b-41d4-a716-446655440000',
    )).toBe('authoritative-rebuild:12345:550e8400-e29b-41d4-a716-446655440000');
    expect(() => AdExtensionReplayIdempotencyKeySchema.parse('manual-replay'))
      .toThrow();
    expect(() => AdExtensionReplayIdempotencyKeySchema.parse(`authoritative-rebuild:1:${'x'.repeat(200)}`))
      .toThrow();
  });
});
