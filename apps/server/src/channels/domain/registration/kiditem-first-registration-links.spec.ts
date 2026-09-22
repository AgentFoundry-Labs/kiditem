import { describe, expect, it } from 'vitest';
import {
  parseKidItemFirstRegistrationLinks,
  providerOptionKey,
} from './kiditem-first-registration-links';

const masterProductId = '00000000-0000-4000-8000-000000000001';
const firstInventorySkuId = '00000000-0000-4000-8000-000000000002';
const secondInventorySkuId = '00000000-0000-4000-8000-000000000003';

describe('KidItem-first registration links', () => {
  it('normalizes exact identities and derives provider option keys from the frozen order', () => {
    expect(parseKidItemFirstRegistrationLinks({
      registrationInput: {
        masterProductId: ` ${masterProductId} `,
        optionLinks: [
          { externalOptionId: ' BLUE ', sellpiaInventorySkuId: firstInventorySkuId, quantity: 1 },
          { externalOptionId: 'LARGE', sellpiaInventorySkuId: secondInventorySkuId, quantity: 10 },
        ],
        listingPayload: { items: [{}, {}] },
      },
    }, 'submission-key')).toEqual({
      masterProductId,
      optionLinks: [
        {
          externalOptionId: 'BLUE',
          sellpiaInventorySkuId: firstInventorySkuId,
          quantity: 1,
          providerOptionKey: 'submission-key',
        },
        {
          externalOptionId: 'LARGE',
          sellpiaInventorySkuId: secondInventorySkuId,
          quantity: 10,
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
          { externalOptionId: 'OPTION-1', sellpiaInventorySkuId: firstInventorySkuId, quantity: 1 },
          { externalOptionId: 'ＯＰＴＩＯＮ－１', sellpiaInventorySkuId: secondInventorySkuId, quantity: 1 },
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
          { externalOptionId: 'BLUE', sellpiaInventorySkuId: firstInventorySkuId, quantity: 1 },
        ],
        listingPayload: { items: [{}, {}] },
      },
    }, 'submission-key')).toThrow('must match marketplace item count');
  });
});
