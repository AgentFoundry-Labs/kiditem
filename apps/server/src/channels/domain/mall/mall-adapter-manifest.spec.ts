import { describe, expect, it } from 'vitest';
import {
  MALL_ADAPTER_MANIFESTS,
  getMallAdapterManifest,
  listSendableMallManifests,
  mallInboundSupports,
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

  /** KID-105 Q2. 새로 들어온 주문수집 몰은 코드는 있어도 검증 전이다 — 운영 화면에서 지원으로 보이지 않는다. */
  it('⭐ keeps the seven malls new to order collection unverified', () => {
    for (const key of ['gmarket', 'auction', '11st', 'smartstore', 'ssg', 'thirtymall', 'yoons']) {
      expect(getMallAdapterManifest(key)?.unverified).toBe(true);
    }
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
    // 그 몰들은 아직 검증 전이라 닫혀 있으므로, 같은 위험을 가진 검증된 몰 모양으로 규칙을 본다.
    const toss = getMallAdapterManifest('toss')!;
    const deletesOnSoldOut = {
      ...toss,
      supports: { ...toss.supports, setSaleStatus: 'option' as const },
      hazards: { ...toss.hazards, soldOutDeletesListing: true },
    };
    expect(resolveSoldOutCommand(deletesOnSoldOut)).toEqual({ allowed: true, downgradedTo: 'suspended' });
  });

  it('refuses an unverified mall even where the documented path would downgrade', () => {
    const gmarket = getMallAdapterManifest('gmarket')!;
    expect(resolveSoldOutCommand(gmarket).allowed).toBe(false);
  });

  /** 도매꾹 품절 = 목록 [수정저장] 의 진열안함(2026-09-18 실측). 확장 `mall-availability-send.js` 에 구현이 있다. */
  it('sends sold_out to 도매꾹 through its own admin list', () => {
    const domeggook = getMallAdapterManifest('domeggook')!;
    expect(resolveSoldOutCommand(domeggook)).toEqual({ allowed: true, downgradedTo: 'sold_out' });
    expect(domeggook.soldOutRoute).toBe('mall_admin');
    expect(domeggook.supports.resume).toBe(true);
    expect(domeggook.supports.setStock).toBeNull();
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

/**
 * 쇼핑몰 현황의 주문수집 칸. 사장님 확인(2026-09-17): 아트공구는 우리 수집기로, 쿠팡 로켓은
 * 발주 수집으로 들어오고, 옥션 · 지마켓 · 11번가 · 신세계 · 스마트스토어 · 쿠팡(마켓플레이스)은
 * 셀피아가 가져온다.
 */
describe('mallInboundSupports', () => {
  it.each(['art09', 'rocket', 'kidsnote', 'coupang-direct'])('%s 는 우리 수집기로 들어온다', (mallKey) => {
    expect(mallInboundSupports(mallKey)).toMatchObject({
      collectsOrders: true,
      orderCollectionVia: 'kiditem',
    });
  });

  it.each(['auction', 'gmarket', '11st', 'ssg', 'smartstore', 'coupang'])('⭐ %s 는 셀피아 주문수집으로 들어온다', (mallKey) => {
    expect(mallInboundSupports(mallKey)).toMatchObject({
      collectsOrders: true,
      orderCollectionVia: 'sellpia',
    });
  });

  it('길이 없는 몰은 들어오지 않는다고 말한다 — 추측으로 초록을 칠하지 않는다', () => {
    expect(mallInboundSupports('toss')).toEqual({
      collectsOrders: false,
      orderCollectionVia: null,
      uploadsTracking: false,
    });
  });

  it('두 길에 한 몰이 함께 들어 있지 않다', () => {
    const viaBoth = MALL_ADAPTER_MANIFESTS
      .map((manifest) => manifest.key)
      .filter((key) => {
        const supports = mallInboundSupports(key);
        return supports.collectsOrders !== (supports.orderCollectionVia !== null);
      });
    expect(viaBoth).toEqual([]);
  });
});
