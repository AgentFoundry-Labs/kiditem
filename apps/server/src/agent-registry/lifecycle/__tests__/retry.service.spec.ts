import { describe, it, expect } from 'vitest';
import { RetryService } from '../retry.service';

describe('RetryService', () => {
  const service = new RetryService();

  it('builds retry prompt on first failure', () => {
    const result = service.buildRetryPrompt('original prompt', ['field X missing'], 0);
    expect(result).toContain('PREVIOUS OUTPUT WAS INVALID');
    expect(result).toContain('field X missing');
    expect(result).toContain('original prompt');
  });

  it('returns null on second retry (max 1)', () => {
    const result = service.buildRetryPrompt('original', ['error'], 1);
    expect(result).toBeNull();
  });

  it('returns null for empty errors', () => {
    const result = service.buildRetryPrompt('original', [], 0);
    expect(result).toBeNull();
  });
});
