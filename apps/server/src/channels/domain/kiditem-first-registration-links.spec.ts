import { describe, expect, it } from 'vitest';
import {
  parseKidItemFirstRegistrationLinks,
  providerOptionKey,
} from './kiditem-first-registration-links';

const masterProductId = '00000000-0000-4000-8000-000000000001';
const firstVariantId = '00000000-0000-4000-8000-000000000002';
const secondVariantId = '00000000-0000-4000-8000-000000000003';

describe('KidItem-first registration links', () => {
  it('normalizes exact identities and derives provider option keys from the frozen order', () => {
    expect(parseKidItemFirstRegistrationLinks({
      registrationInput: {
        masterProductId: ` ${masterProductId} `,
        optionLinks: [
          { externalOptionId: ' BLUE ', productVariantId: firstVariantId },
          { externalOptionId: 'LARGE', productVariantId: secondVariantId },
        ],
        listingPayload: { items: [{}, {}] },
      },
    }, 'submission-key')).toEqual({
      masterProductId,
      optionLinks: [
        {
          externalOptionId: 'BLUE',
          productVariantId: firstVariantId,
          providerOptionKey: 'submission-key',
        },
        {
          externalOptionId: 'LARGE',
          productVariantId: secondVariantId,
          providerOptionKey: 'submission-key:1',
        },
      ],
    });
    expect(providerOptionKey('submission-key', 2)).toBe('submission-key:2');
  });

  it('rejects malformed UUIDs before a provider side effect', () => {
    expect(() => parseKidItemFirstRegistrationLinks({
      registrationInput: {
        masterProductId: 'not-a-uuid',
        optionLinks: [],
        listingPayload: { items: [{}] },
      },
    }, 'submission-key')).toThrow('masterProductId must be a UUID');
  });

  it('rejects option identities that collide after Unicode normalization', () => {
    expect(() => parseKidItemFirstRegistrationLinks({
      registrationInput: {
        masterProductId,
        optionLinks: [
          { externalOptionId: 'OPTION-1', productVariantId: firstVariantId },
          { externalOptionId: 'ＯＰＴＩＯＮ－１', productVariantId: secondVariantId },
        ],
        listingPayload: { items: [{}, {}] },
      },
    }, 'submission-key')).toThrow('option identities must be unique');
  });

  it('requires one exact option link for every provider item', () => {
    expect(() => parseKidItemFirstRegistrationLinks({
      registrationInput: {
        masterProductId,
        optionLinks: [
          { externalOptionId: 'BLUE', productVariantId: firstVariantId },
        ],
        listingPayload: { items: [{}, {}] },
      },
    }, 'submission-key')).toThrow('must match marketplace item count');
  });
});
