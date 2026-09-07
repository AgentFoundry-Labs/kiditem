import { describe, expect, it } from 'vitest';
import {
  MALL_ADAPTER_MANIFESTS,
  getMallAdapterManifest,
  listSendableMallManifests,
  requiresManualResume,
  resolveSoldOutCommand,
} from './mall-adapter-manifest';

describe('MALL_ADAPTER_MANIFESTS', () => {
  it('declares every order-collection mall plus both Coupang channel identities', () => {
    // 주문수집 27개 몰 + 마켓플레이스 쿠팡 + 사입 로켓.
    expect(MALL_ADAPTER_MANIFESTS).toHaveLength(29);
    expect(getMallAdapterManifest('coupang')?.applicable).toBe(true);
    expect(getMallAdapterManifest('coupang-direct')?.applicable).toBe(false);
  });

  it('covers the channel keys that actually own listings today', () => {
    // ChannelAccount.channel 이 'coupang' / 'rocket' 이라 품절 화면이 이 두 키로
    // 매니페스트를 찾는다. 빠지면 "매니페스트가 없습니다"로만 보인다.
    for (const key of ['coupang', 'rocket']) {
      expect(getMallAdapterManifest(key)).not.toBeNull();
    }
  });

  it('has no duplicate keys', () => {
    const keys = MALL_ADAPTER_MANIFESTS.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('closes every write path on unverified malls regardless of the seed', () => {
    for (const entry of MALL_ADAPTER_MANIFESTS.filter((candidate) => candidate.unverified)) {
      expect(entry.supports).toEqual({
        createListing: false,
        updateListing: false,
        setStock: null,
        setSaleStatus: null,
        soldOut: false,
        resume: false,
      });
    }
  });

  it('carries a sourced note on every mall so the UI never shows a bare flag', () => {
    for (const entry of MALL_ADAPTER_MANIFESTS) {
      expect(entry.note.length).toBeGreaterThan(20);
    }
  });
});

describe('listSendableMallManifests', () => {
  it('excludes unverified malls and non-selling channels', () => {
    const keys = listSendableMallManifests().map((entry) => entry.key);
    expect(keys).toContain('kidsnote');
    expect(keys).not.toContain('11st');
    expect(keys).not.toContain('coupang-direct');
  });
});

describe('resolveSoldOutCommand', () => {
  it('sends sold_out straight through on a mall where it is reversible', () => {
    const toss = getMallAdapterManifest('toss')!;
    expect(resolveSoldOutCommand(toss)).toEqual({ allowed: true, downgradedTo: 'sold_out' });
  });

  it('downgrades to suspended where a full sold-out permanently deletes the listing', () => {
    // 사방넷 원문: 완전품절송신은 ESM옥션·ESM지마켓·11번가·인터파크·고도몰에서 영구삭제다.
    const gmarket = getMallAdapterManifest('gmarket')!;
    expect(resolveSoldOutCommand(gmarket)).toEqual({ allowed: true, downgradedTo: 'suspended' });
  });

  it('refuses malls with no sold-out path at all', () => {
    const alwayz = getMallAdapterManifest('always')!;
    expect(resolveSoldOutCommand(alwayz).allowed).toBe(false);
  });

  it('refuses a channel that does not sell products', () => {
    const direct = getMallAdapterManifest('coupang-direct')!;
    expect(resolveSoldOutCommand(direct).allowed).toBe(false);
  });
});

describe('requiresManualResume', () => {
  it('is false for every currently sendable mall', () => {
    // 해법몰처럼 해제 경로가 다른 몰은 resumeRequiresAlternatePath 로 표시하고,
    // 아예 되돌릴 수 없는 몰만 수동으로 넘긴다.
    expect(listSendableMallManifests().filter(requiresManualResume)).toEqual([]);
  });

  it('flags haebub-mall as needing a different resume path', () => {
    const haebub = getMallAdapterManifest('haebub-mall')!;
    expect(haebub.hazards.resumeRequiresAlternatePath).toBe(true);
  });
});
