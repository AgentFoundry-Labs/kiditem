import { describe, expect, it } from 'vitest';
import { GenericMallChannelAdapter } from './generic-mall.adapter';

const account = (externalAccountId: string | null = null) => ({ id: 'a1', channel: 'kidkids', vendorId: 'ignored', externalAccountId });
const evidence = (input: Partial<{ providerAccountId: string | null; observedUrl: string | null; externalListingId: string | null }> = {}) => ({
  providerAccountId: null, observedUrl: null, externalListingId: null, ...input,
});

describe('GenericMallChannelAdapter', () => {
  it('answers the registry delivery, the external account id and no mall payload or image runner', async () => {
    const adapter = new GenericMallChannelAdapter('kidkids');
    expect(adapter).toMatchObject({ channel: 'kidkids', delivery: 'form', representativeImage: null, externalListingIdPattern: null });
    expect(new GenericMallChannelAdapter('kidsnote').delivery).toBe('sheet');
    expect(adapter.providerAccountId(account(' seller-9 '))).toBe('seller-9');
    expect(adapter.providerAccountId(account())).toBeNull();
    await expect(adapter.prepareAdapterPayload()).resolves.toEqual({});
    expect(adapter.availabilityOption()).toBe('sendable');
  });

  it('trusts only the https admin origin the mall admin reader names', () => {
    const adapter = new GenericMallChannelAdapter('kidkids');
    const decide = (observedUrl: string) => adapter.validateConfirmationEvidence(account(), null, evidence({ observedUrl }));
    expect(decide('https://partner.kidkids.net/goods/123')).toEqual({ ok: true });
    expect(decide('http://partner.kidkids.net/goods/123')).toEqual({ ok: false, reason: 'untrusted_url' });
    expect(decide('https://user:pw@partner.kidkids.net/goods/123')).toEqual({ ok: false, reason: 'untrusted_url' });
    expect(decide('https://evil.example/partner.kidkids.net')).toEqual({ ok: false, reason: 'untrusted_url' });
    expect(new GenericMallChannelAdapter('kakao').validateConfirmationEvidence(
      { ...account(), channel: 'kakao' }, null, evidence({ observedUrl: 'https://partner.kidkids.net/goods/1' }),
    )).toEqual({ ok: false, reason: 'untrusted_url' });
  });

  it('matches the provider account against the one frozen at preparation', () => {
    const adapter = new GenericMallChannelAdapter('kidkids');
    expect(adapter.validateConfirmationEvidence(account('s-1'), 's-1', evidence({ providerAccountId: 's-1' }))).toEqual({ ok: true });
    expect(adapter.validateConfirmationEvidence(account('s-1'), 's-1', evidence({ providerAccountId: 's-2' })))
      .toEqual({ ok: false, reason: 'account_mismatch' });
    expect(adapter.validateConfirmationEvidence(account('s-1'), 's-1', evidence()))
      .toEqual({ ok: false, reason: 'missing_account' });
    // 준비 뒤 계정 식별자가 바뀌었다.
    expect(adapter.validateConfirmationEvidence(account('s-9'), 's-1', evidence({ providerAccountId: 's-1' })))
      .toEqual({ ok: false, reason: 'account_mismatch' });
    // 준비가 식별자를 얼리지 않았으면 증거가 댄 식별자는 맞출 대상이 없다.
    expect(adapter.validateConfirmationEvidence(account(), null, evidence({ providerAccountId: 's-1' })))
      .toEqual({ ok: false, reason: 'account_mismatch' });
  });
});
