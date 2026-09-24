import { describe, expect, it } from 'vitest';
import {
  ProductPreparationProjectionSchema,
  ProductPreparationStatusSchema,
} from './product-preparation';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

describe('RegistrationTarget shared contract', () => {
  it.each(['draft', 'submitting', 'registered', 'failed', 'cancelled']) (
    'accepts the %s state',
    (status) => expect(ProductPreparationStatusSchema.parse(status)).toBe(status),
  );

  it.each(['promoted', 'sourced', 'active', ''])('rejects the non-state %s', (status) => {
    expect(() => ProductPreparationStatusSchema.parse(status)).toThrow();
  });

  it('projects canonical account, source-workspace, and listing identities', () => {
    expect(ProductPreparationProjectionSchema.parse({
      id: '22222222-2222-4222-8222-222222222222',
      sourceRecordId: '33333333-3333-4333-8333-333333333333',
      channelAccountId: ACCOUNT_ID,
      sourceContentWorkspaceId: '44444444-4444-4444-8444-444444444444',
      channelListingId: '55555555-5555-4555-8555-555555555555',
      status: 'registered',
      selectedThumbnailUrl: 'https://cdn.example.com/thumb.png',
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
      updatedAt: '2026-07-13T00:00:00.000Z',
    })).toMatchObject({
      channelAccountId: ACCOUNT_ID,
      sourceContentWorkspaceId: '44444444-4444-4444-8444-444444444444',
      channelListingId: '55555555-5555-4555-8555-555555555555',
    });
  });
});
