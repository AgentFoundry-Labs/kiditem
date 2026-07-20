import { describe, expect, it } from 'vitest';
import {
  canRetryProductRegistrationExecutionProviderSideEffect,
  OPERATION_STATUSES,
  OperationStatusSchema,
  ProductRegistrationExecutionSchema,
  PROVIDER_OUTCOMES,
  ProviderOutcomeSchema,
} from './index';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PREPARATION_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';

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

  it('parses a preparation-fenced registration execution', () => {
    expect(ProductRegistrationExecutionSchema.parse({
      id: '44444444-4444-4444-8444-444444444444',
      organizationId: ORGANIZATION_ID,
      productPreparationId: PREPARATION_ID,
      channelAccountId: ACCOUNT_ID,
      channelListingId: null,
      executionKind: 'create',
      expectedProviderAccountId: null,
      idempotencyKey: 'register:rain-boots:v1',
      requestHash: 'sha256:request',
      submissionPayloadJson: { title: 'Rain boots' },
      submissionPayloadHash: 'sha256:payload',
      status: 'prepared',
      providerOutcome: 'not_attempted',
      providerSubmissionId: null,
      externalListingId: null,
      resultJson: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      leaseToken: null,
      leaseClaimedAt: null,
      requestedByUserId: null,
      startedAt: null,
      completedAt: null,
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    })).toMatchObject({
      productPreparationId: PREPARATION_ID,
      channelAccountId: ACCOUNT_ID,
      status: 'prepared',
      providerOutcome: 'not_attempted',
    });
  });

  it.each(['prepared', 'executing', 'reconciling'] as const)(
    'retries provider create side effects only before a provider attempt (%s)',
    (status) => {
      expect(canRetryProductRegistrationExecutionProviderSideEffect(status, 'not_attempted')).toBe(true);
      expect(canRetryProductRegistrationExecutionProviderSideEffect(status, 'uncertain')).toBe(false);
      expect(canRetryProductRegistrationExecutionProviderSideEffect(status, 'succeeded')).toBe(false);
      expect(canRetryProductRegistrationExecutionProviderSideEffect(status, 'definitive_failure')).toBe(false);
    },
  );

  it.each(['succeeded', 'failed', 'cancelled'] as const)(
    'treats the %s operation status as terminal',
    (status) => {
      expect(canRetryProductRegistrationExecutionProviderSideEffect(status, 'not_attempted')).toBe(false);
    },
  );
});
