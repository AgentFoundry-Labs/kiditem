import { describe, it, expect } from 'vitest';
import { SourcingCandidateStatusSchema, SOURCING_CANDIDATE_STATUSES } from '../candidate-status';

describe('SourcingCandidateStatusSchema', () => {
  it('accepts valid statuses', () => {
    for (const s of SOURCING_CANDIDATE_STATUSES) {
      expect(() => SourcingCandidateStatusSchema.parse(s)).not.toThrow();
    }
  });

  it('rejects unknown status', () => {
    expect(() => SourcingCandidateStatusSchema.parse('approved')).toThrow();
    expect(() => SourcingCandidateStatusSchema.parse('drafting')).toThrow();
    expect(() => SourcingCandidateStatusSchema.parse('promoted')).toThrow();
    expect(() => SourcingCandidateStatusSchema.parse('')).toThrow();
  });

  it('exposes union type', () => {
    const v: 'sourced' | 'rejected' = 'sourced';
    expect(SourcingCandidateStatusSchema.parse(v)).toBe('sourced');
  });
});
