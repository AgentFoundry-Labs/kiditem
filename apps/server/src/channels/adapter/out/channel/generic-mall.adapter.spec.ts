import { describe, expect, it } from 'vitest';
import { GenericMallChannelAdapter } from './generic-mall.adapter';

const account = (externalAccountId: string | null = null) => ({ id: 'a1', channel: 'kidkids', vendorId: 'ignored', externalAccountId });
const evidence = (input: Partial<{ providerAccountId: string | null; observedUrl: string | null; externalListingId: string | null }> = {}) => ({
  providerAccountId: null, observedUrl: null, externalListingId: null, ...input,
});

describe('GenericMallChannelAdapter', () => {
  it('answers the external account id and no mall payload or image runner', async () => {
    const adapter = new GenericMallChannelAdapter('kidkids');
    expect(adapter).toMatchObject({ channel: 'kidkids' });
    expect(adapter.providerAccountId(account(' seller-9 '))).toBe('seller-9');
    expect(adapter.providerAccountId(account())).toBeNull();
    await expect(adapter.prepareAdapterPayload()).resolves.toEqual({});
    expect(adapter.availabilityOption()).toBe('sendable');
  });

  it('trusts only the https admin origin the mall admin reader names', () => {
    const adapter = new GenericMallChannelAdapter('kidkids');
    const decide = (observedUrl: string) => adapter.validateConfirmationEvidence(null, evidence({ observedUrl }));
    expect(decide('https://partner.kidkids.net/goods/123')).toEqual({ ok: true });
    expect(decide('http://partner.kidkids.net/goods/123')).toEqual({ ok: false, reason: 'untrusted_url' });
    expect(decide('https://user:pw@partner.kidkids.net/goods/123')).toEqual({ ok: false, reason: 'untrusted_url' });
    expect(decide('https://evil.example/partner.kidkids.net')).toEqual({ ok: false, reason: 'untrusted_url' });
    expect(new GenericMallChannelAdapter('kakao').validateConfirmationEvidence(null, evidence({ observedUrl: 'https://partner.kidkids.net/goods/1' }),
    )).toEqual({ ok: false, reason: 'untrusted_url' });
  });

  it('matches the provider account against the one frozen at preparation', () => {
    const adapter = new GenericMallChannelAdapter('kidkids');
    expect(adapter.validateConfirmationEvidence('s-1', evidence({ providerAccountId: 's-1' }))).toEqual({ ok: true });
    expect(adapter.validateConfirmationEvidence('s-1', evidence({ providerAccountId: 's-2' })))
      .toEqual({ ok: false, reason: 'account_mismatch' });
    // 몰 화면이 계정 식별자를 주지 않는 몰(KID-364): 증거에 없으면 대조하지 않고, 준비가 얼리지 않았어도 대조하지 않는다.
    expect(adapter.validateConfirmationEvidence('s-1', evidence())).toEqual({ ok: true });
    expect(adapter.validateConfirmationEvidence(null, evidence({ providerAccountId: 's-1' }))).toEqual({ ok: true });
  });
});
