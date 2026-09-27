import { describe, expect, it, vi } from 'vitest';
import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { PrepareAdapterPayloadInput } from '../../../../application/port/out/channel/channel-adapter.port';
import { CoupangChannelAdapter } from './coupang-channel.adapter';

const SKU_ID = '0b9f3a52-6a0e-4d37-9c55-6f0a3f1c2d10';
const TX = {} as OwnerTransaction;
const account = (vendorId: string | null = 'A00012345', externalAccountId: string | null = null) =>
  ({ id: 'acc-1', channel: 'coupang', vendorId, externalAccountId });
const evidence = (input: Partial<{ providerAccountId: string | null; observedUrl: string | null; externalListingId: string | null }> = {}) => ({
  providerAccountId: 'A00012345', observedUrl: null, externalListingId: '1234567890', ...input,
});

function preflight() {
  return vi.fn().mockResolvedValue({
    sellpiaMatch: { sellpiaInventorySkuId: SKU_ID, code: 'KID00000077', name: '셀피아 장화', optionName: null, currentStock: 4, quantity: 1 },
    existingListing: null,
  });
}

function payloadInput(input: Partial<PrepareAdapterPayloadInput> = {}): PrepareAdapterPayloadInput {
  return {
    organizationId: 'org-1',
    channelAccountId: 'acc-1',
    account: account(),
    salesProductId: 'sp-1',
    registrationTargetId: 'target-1',
    kind: 'register',
    registrationInput: {
      mallCategory: null,
      mallFields: {},
      adapter: { coupang: { wingCategoryKey: '64687', wingProduct: { sellerProductName: '윙 등록명', brand: 'kiditem', variants: [{ price: 12900 }] } } },
    },
    adapterValues: { sellpiaInventorySkuId: SKU_ID, sellpiaQuantity: '1' },
    channelListingId: null,
    product: { name: '어린이 장화', options: [{ id: 'opt-1', optionCode: 'KID00000123' }] } as unknown as PrepareAdapterPayloadInput['product'],
    ...input,
  };
}

describe('CoupangChannelAdapter', () => {
  it('is the channel that answers by vendor id', () => {
    const adapter = new CoupangChannelAdapter({ preflightExternalProductRegistration: preflight() });
    expect(adapter).toMatchObject({ channel: 'coupang' });
    expect(adapter.providerAccountId(account(' A00012345 '))).toBe('A00012345');
    expect(adapter.providerAccountId(account(null, 'legacy-vendor'))).toBe('legacy-vendor');
    expect(adapter.providerAccountId(account(null, null))).toBeNull();
  });

  it('accepts only the vendor frozen at preparation, the wing.coupang.com origin and a numeric listing id', () => {
    const adapter = new CoupangChannelAdapter({ preflightExternalProductRegistration: preflight() });
    const decide = (input: Parameters<typeof evidence>[0]) => adapter.validateConfirmationEvidence('A00012345', evidence(input));
    expect(decide({ observedUrl: 'https://wing.coupang.com/vendor-inventory/list?x=1' })).toEqual({ ok: true });
    expect(decide({ observedUrl: 'https://www.coupang.com/vp/products/1' })).toEqual({ ok: false, reason: 'untrusted_url' });
    expect(decide({ observedUrl: 'http://wing.coupang.com/' })).toEqual({ ok: false, reason: 'untrusted_url' });
    expect(decide({ providerAccountId: 'A99999999' })).toEqual({ ok: false, reason: 'account_mismatch' });
    expect(decide({ providerAccountId: null })).toEqual({ ok: false, reason: 'missing_account' });
    expect(decide({ externalListingId: 'W-123' })).toEqual({ ok: false, reason: 'invalid_listing_id' });
    expect(decide({ externalListingId: '12345' })).toEqual({ ok: false, reason: 'invalid_listing_id' });
  });

  it('sends seller stock only for normal options, refuses Rocket Growth options and waits on an unknown type', () => {
    const adapter = new CoupangChannelAdapter({ preflightExternalProductRegistration: preflight() });
    expect(adapter.availabilityOption({ registrationType: 'NORMAL' })).toBe('sendable');
    expect(adapter.availabilityOption({ registrationType: 'RFM' })).toBe('excluded');
    expect(adapter.availabilityOption({ registrationType: null })).toBe('unknown');
  });

  it('freezes the Wing product, the Sellpia match and the option KID as the vendor item code for a register', async () => {
    const run = preflight();
    const adapter = new CoupangChannelAdapter({ preflightExternalProductRegistration: run });
    await expect(adapter.prepareAdapterPayload(TX, payloadInput())).resolves.toEqual({
      wingProduct: {
        sellerProductName: '윙 등록명',
        productName: '어린이 장화',
        brand: 'kiditem',
        variants: [{ price: 12900, vendorItemCode: 'KID00000123' }],
      },
      sellpiaMatch: { sellpiaInventorySkuId: SKU_ID, code: 'KID00000077', name: '셀피아 장화', optionName: null, quantity: 1 },
      existingChannelListing: null,
      vendorItemCode: 'KID00000123',
    });
    expect(run).toHaveBeenCalledWith({
      organizationId: 'org-1',
      channelAccountId: 'acc-1',
      channelListingOptionId: 'sp-1',
      listingName: '윙 등록명',
      itemName: '어린이 장화',
      selectedSellpiaInventorySkuId: SKU_ID,
      selectedQuantity: 1,
    });
  });

  it('lets the Sellpia preflight suggest the match when the operator picked none', async () => {
    const run = preflight();
    const adapter = new CoupangChannelAdapter({ preflightExternalProductRegistration: run });
    await adapter.prepareAdapterPayload(TX, payloadInput({ adapterValues: {}, registrationInput: { mallCategory: null, mallFields: {}, adapter: {} } }));
    expect(run).toHaveBeenCalledWith({
      organizationId: 'org-1', channelAccountId: 'acc-1', channelListingOptionId: 'sp-1',
      listingName: '어린이 장화', itemName: '어린이 장화',
    });
  });

  it('freezes nothing for a kind that is not a registration', async () => {
    const run = preflight();
    const adapter = new CoupangChannelAdapter({ preflightExternalProductRegistration: run });
    await expect(adapter.prepareAdapterPayload(TX, payloadInput({ kind: 'sold_out' }))).resolves.toEqual({});
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses a registration without a vendor identity, with several options or with an unissued KID', async () => {
    const adapter = new CoupangChannelAdapter({ preflightExternalProductRegistration: preflight() });
    await expect(adapter.prepareAdapterPayload(TX, payloadInput({ account: account(null, null) })))
      .rejects.toThrow('vendor identity');
    await expect(adapter.prepareAdapterPayload(TX, payloadInput({
      product: { name: 'x', options: [{ id: 'a', optionCode: 'KID1' }, { id: 'b', optionCode: 'KID2' }] } as never,
    }))).rejects.toThrow('one option');
    await expect(adapter.prepareAdapterPayload(TX, payloadInput({
      product: { name: 'x', options: [{ id: 'a', optionCode: null }] } as never,
    }))).rejects.toThrow('KID');
  });
  it('lays the frozen WING values and image over the web form, and refuses a product already on this account (KID-364)', () => {
    const adapter = new CoupangChannelAdapter({ preflightExternalProductRegistration: preflight() });
    const form = {
      categoryCell: '웹 카테고리', productName: '웹 노출명', sellerProductName: '웹 등록명', brand: 'kiditem',
      variants: [{ purchaseOptions: [{ type: '색상', value: '단일' }], stock: 999, salePrice: 12900, representativeImageUrl: 'https://img/web.png' }],
    };
    const frozen = adapter.freezeForm(form, {
      wingProduct: { sellerProductName: '윙 등록명', productName: '윙 노출명', variants: [{ stock: 5, vendorItemCode: 'KID00000123' }] },
      representativeImage: { assetId: 'a', url: 'https://img/asset.png' },
      existingChannelListing: null,
    });
    expect(frozen).toEqual({
      categoryCell: '웹 카테고리', productName: '윙 노출명', sellerProductName: '윙 등록명', brand: 'kiditem',
      variants: [{ purchaseOptions: [{ type: '색상', value: '단일' }], stock: 5, salePrice: 12900, representativeImageUrl: 'https://img/asset.png', vendorItemCode: 'KID00000123' }],
    });
    expect(adapter.freezeForm(null, {})).toBeNull();
    expect(() => adapter.freezeForm(form, { existingChannelListing: { externalListingId: '9876543210' } }))
      .toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED', message: '이 계정에 같은 상품이 이미 있습니다(몰 상품 번호 9876543210).', details: expect.objectContaining({ reason: 'EXISTING_CHANNEL_LISTING' }) }));
  });
});
