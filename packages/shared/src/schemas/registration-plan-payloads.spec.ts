import { describe, expect, it } from 'vitest';
import { parseRegistrationPayload } from './registration-plan-payloads.js';

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('registration plan payloads (KID-364)', () => {
  it('a quick register freezes the mall form without a target snapshot', () => {
    const payload = parseRegistrationPayload('register', { snapshot: null, form: { url: 'https://mall.example/new', manualSteps: [] } });
    expect(payload).toEqual({ snapshot: null, form: { url: 'https://mall.example/new', manualSteps: [] } });
  });

  it('a document payload needs a snapshot or a form', () => {
    expect(() => parseRegistrationPayload('update', { snapshot: null, form: null })).toThrow();
    expect(() => parseRegistrationPayload('composition_change', { form: {} })).toThrow();
  });

  it('a sold-out batch lists each listing with its external ids and options', () => {
    const payload = parseRegistrationPayload('sold_out', {
      action: 'sold_out',
      listings: [{
        channelListingId: UUID(1),
        externalListingId: '123',
        options: [{ salesProductOptionId: null, channelListingOptionId: UUID(2), externalOptionId: '9', sellerSku: null }],
      }],
    });
    expect(payload).toMatchObject({ action: 'sold_out', listings: [{ externalListingId: '123' }] });
  });

  it('the batch action must match the execution kind and hold at least one listing', () => {
    expect(() => parseRegistrationPayload('resume', { action: 'sold_out', listings: [] })).toThrow();
    expect(() => parseRegistrationPayload('resume', {
      action: 'sold_out',
      listings: [{ channelListingId: UUID(1), externalListingId: '1', options: [] }],
    })).toThrow();
  });

  it('a thumbnail payload carries the image and the listing it goes to', () => {
    const payload = parseRegistrationPayload('thumbnail_update', {
      dataUrl: 'data:image/png;base64,AAAA', filename: 'a.png', mimeType: 'image/png',
      salesProductId: UUID(3), channelListingId: UUID(4), externalListingId: '55', assetId: UUID(5), productName: '상품',
    });
    expect(payload).toMatchObject({ externalListingId: '55', assetId: UUID(5) });
    expect(() => parseRegistrationPayload('thumbnail_update', { salesProductId: UUID(3) })).toThrow();
  });
});
