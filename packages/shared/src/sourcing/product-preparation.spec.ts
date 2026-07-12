import { describe, expect, it } from 'vitest';
import {
  CreateProductPreparationInputSchema,
  ProductPreparationStatusSchema,
  UpdateProductPreparationInputSchema,
} from './product-preparation';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

describe('ProductPreparation shared contract', () => {
  it.each(['draft', 'submitting', 'registered', 'failed', 'cancelled']) (
    'accepts the %s state',
    (status) => expect(ProductPreparationStatusSchema.parse(status)).toBe(status),
  );

  it.each(['promoted', 'sourced', 'active', ''])('rejects the non-state %s', (status) => {
    expect(() => ProductPreparationStatusSchema.parse(status)).toThrow();
  });

  it('requires an account, display name, and editable registration input', () => {
    expect(
      CreateProductPreparationInputSchema.parse({
        channelAccountId: ACCOUNT_ID,
        displayName: '  Kids rain boots  ',
        registrationInput: { salePrice: 21900, notices: ['age'] },
      }),
    ).toEqual({
      channelAccountId: ACCOUNT_ID,
      displayName: 'Kids rain boots',
      registrationInput: { salePrice: 21900, notices: ['age'] },
    });
  });

  it('accepts only the approved optional content selections', () => {
    expect(
      CreateProductPreparationInputSchema.parse({
        channelAccountId: ACCOUNT_ID,
        displayName: 'Rain boots',
        registrationInput: {},
        selectedThumbnailUrl: 'https://cdn.example.com/thumb.png',
        selectedThumbnailGenerationId: '33333333-3333-4333-8333-333333333333',
        selectedThumbnailGenerationCandidateId: '44444444-4444-4444-8444-444444444444',
        selectedDetailPageArtifactId: '55555555-5555-4555-8555-555555555555',
        selectedDetailPageRevisionId: '66666666-6666-4666-8666-666666666666',
        selectedDetailPageGenerationId: '77777777-7777-4777-8777-777777777777',
      }),
    ).toMatchObject({ selectedThumbnailUrl: 'https://cdn.example.com/thumb.png' });
  });

  it('keeps the account immutable in draft updates', () => {
    expect(UpdateProductPreparationInputSchema.parse({ registrationInput: { salePrice: 23900 } }))
      .toEqual({ registrationInput: { salePrice: 23900 } });
    expect(() =>
      UpdateProductPreparationInputSchema.parse({
        channelAccountId: ACCOUNT_ID,
        registrationInput: {},
      }),
    ).toThrow();
    expect(() =>
      CreateProductPreparationInputSchema.parse({
        channelAccountId: ACCOUNT_ID,
        sourceContentWorkspaceId: '22222222-2222-4222-8222-222222222222',
        displayName: 'Rain boots',
        registrationInput: {},
      }),
    ).toThrow();
    expect(() => UpdateProductPreparationInputSchema.parse({})).toThrow();
  });
});
