import { describe, expect, it } from 'vitest';
import { MALL_CHANNELS, findChannel } from '@kiditem/shared/channel-registry';
import {
  MALL_ADAPTER_MANIFESTS,
  getMallAdapterManifest,
  listSendableMallManifests,
  mallInboundSupports,
  requiresManualResume,
  resolveSoldOutCommand,
} from './mall-adapter-manifest';

describe('MALL_ADAPTER_MANIFESTS', () => {
  it('⭐ 몰 27개만 담고 레지스트리 순서를 그대로 쓴다', () => {
    expect(MALL_ADAPTER_MANIFESTS.map((entry) => entry.key)).toEqual(
      MALL_CHANNELS.map((entry) => entry.key),
    );
    expect(MALL_ADAPTER_MANIFESTS).toHaveLength(27);
    expect(getMallAdapterManifest('coupang-direct')?.applicable).toBe(false);
  });

  /**
   * 쿠팡 마켓플레이스와 쿠팡 로켓은 마켓 판매자 시스템이라 몰 등록 마법사에 서지 않는다
   * (KID-250). 정체 · 이름 · 능력은 채널 레지스트리가 계속 답하므로, 그 채널의 리스팅과
   * 품절 후보는 매니페스트 없이도 제 이름으로 보인다.
   */
  it('⭐ 마켓 판매자 시스템은 몰 매니페스트에 없고 레지스트리가 답한다', () => {
    for (const key of ['coupang', 'rocket']) {
      expect(getMallAdapterManifest(key)).toBeNull();
      expect(findChannel(key)?.kind).toBe('marketplace');
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

  it('closes registration writes on unverified malls while preserving verified admin stop routes', () => {
    for (const entry of MALL_ADAPTER_MANIFESTS.filter((candidate) => candidate.unverified)) {
      const adminRoute = entry.soldOutRoute === 'mall_admin';
      expect(entry.supports).toEqual({
        createListing: false,
        updateListing: false,
        setStock: null,
        setSaleStatus: adminRoute ? 'listing' : null,
        soldOut: adminRoute,
        resume: adminRoute ? entry.supports.resume : false,
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

  it('preserves the admin stop path when an unverified mall downgrades dangerous sold-out commands', () => {
    const gmarket = getMallAdapterManifest('gmarket')!;
    expect(resolveSoldOutCommand(gmarket)).toEqual({ allowed: true, downgradedTo: 'suspended' });
  });

  it('refuses malls with no sold-out path at all', () => {
    const boribori = getMallAdapterManifest('boribori')!;
    expect(resolveSoldOutCommand(boribori).allowed).toBe(false);
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
 * 발주 수집으로 들어오고, 옥션 · 지마켓 · 11번가 · 신세계 · 스마트스토어 · 쿠팡 WING은
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
