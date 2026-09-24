import { describe, expect, it } from 'vitest';
import {
  canRetryProviderSideEffect,
  OPERATION_STATUSES,
  OperationStatusSchema,
  PROVIDER_OUTCOMES,
  ProviderOutcomeSchema,
} from './registration-execution';

describe('product registration execution contracts', () => {
  it.each(OPERATION_STATUSES)('accepts the %s operation status', (status) => {
    expect(OperationStatusSchema.parse(status)).toBe(status);
  });

  it.each(['draft', 'submitting', 'registered', 'pending', '']) (
    'rejects the non-operation status %s',
    (status) => expect(() => OperationStatusSchema.parse(status)).toThrow(),
  );

  it.each(PROVIDER_OUTCOMES)('accepts the %s provider outcome', (outcome) => {
    expect(ProviderOutcomeSchema.parse(outcome)).toBe(outcome);
  });

  it.each(['pending', 'failed', 'unknown', '']) (
    'rejects the non-provider outcome %s',
    (outcome) => expect(() => ProviderOutcomeSchema.parse(outcome)).toThrow(),
  );

  it.each(['prepared', 'executing', 'reconciling'] as const)(
    'retries provider create side effects only before a provider attempt (%s)',
    (status) => {
      expect(canRetryProviderSideEffect(status, 'not_attempted')).toBe(true);
      expect(canRetryProviderSideEffect(status, 'uncertain')).toBe(false);
      expect(canRetryProviderSideEffect(status, 'succeeded')).toBe(false);
      expect(canRetryProviderSideEffect(status, 'definitive_failure')).toBe(false);
    },
  );

  it.each(['succeeded', 'failed', 'cancelled'] as const)(
    'treats the %s operation status as terminal',
    (status) => {
      expect(canRetryProviderSideEffect(status, 'not_attempted')).toBe(false);
    },
  );
});
