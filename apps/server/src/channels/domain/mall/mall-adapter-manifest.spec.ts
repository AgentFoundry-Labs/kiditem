import { describe, expect, it } from 'vitest';
import {
  MALL_ADAPTER_MANIFESTS,
  getMallAdapterManifest,
  listSendableMallManifests,
  mallInboundSupports,
  requiresManualResume,
  resolveSoldOutCommand,
  soldOutSendsByOption,
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

  /**
   * 지마켓 · 옥션 · 11번가 · 스마트스토어는 몰 API 는 확인 전이지만, 품절 · 재개만 그 몰 관리자 화면의 요청으로 열었다
   * (사장님 2026-09-19). 등록 · 수정 · 재고는 여전히 닫혀 있다.
   */
  it('⭐ opens only the sold-out axis on the four marketplaces and 떠리몰', () => {
    for (const key of ['gmarket', 'auction', '11st', 'smartstore', 'thirtymall']) {
      const entry = getMallAdapterManifest(key)!;
      expect(entry.unverified).toBe(true);
      expect(entry.supports).toEqual({
        createListing: false,
        updateListing: false,
        setStock: null,
        setSaleStatus: 'listing',
        soldOut: true,
        resume: true,
      });
      expect(entry.soldOutRoute).toBe('mall_admin');
      expect(entry.resumeRoute).toBe('mall_admin');
      expect(soldOutSendsByOption(key)).toBe(false);
      // 이 몰들의 품절 길은 판매중지다 — 화면이 "판매중지"로 말한다.
      expect(resolveSoldOutCommand(entry)).toEqual({ allowed: true, downgradedTo: 'suspended' });
    }
    // 판매중지를 오래 두면 지운다 — 지마켓 13개월 · 옥션 90일.
    expect(getMallAdapterManifest('gmarket')!.hazards.suspendAutoDeletesAfterDays).toBe(395);
    expect(getMallAdapterManifest('auction')!.hazards.suspendAutoDeletesAfterDays).toBe(90);
  });

  it('closes every write path on unverified malls regardless of the seed — only our admin sold-out route opens its axis', () => {
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

  it('refuses an unverified mall', () => {
    const ssg = getMallAdapterManifest('ssg')!;
    expect(resolveSoldOutCommand(ssg).allowed).toBe(false);
  });

  /** 도매꾹 품절 = 목록 [수정저장] 의 진열안함(2026-09-18 실측). 확장 `mall-availability-send.js` 에 구현이 있다. */
  it('sends sold_out to 도매꾹 through its own admin list', () => {
    const domeggook = getMallAdapterManifest('domeggook')!;
    expect(resolveSoldOutCommand(domeggook)).toEqual({ allowed: true, downgradedTo: 'sold_out' });
    expect(domeggook.soldOutRoute).toBe('mall_admin');
    expect(domeggook.supports.resume).toBe(true);
    expect(domeggook.supports.setStock).toBeNull();
  });

  /** 쿠팡 윙 품절 = 상품목록 일괄적용의 판매상태 변경(2026-09-18 실측). 확장 `mall-availability-send.js` 에 구현이 있다. */
  it('sends sold_out to 쿠팡 as option stock 0 through the Wing product list', () => {
    const coupang = getMallAdapterManifest('coupang')!;
    expect(resolveSoldOutCommand(coupang)).toEqual({ allowed: true, downgradedTo: 'sold_out' });
    expect(coupang.soldOutRoute).toBe('mall_admin');
    // 윙에서 품절 = 옵션 재고 0 이라 옵션 단위로 보낸다. 도매꾹(진열안함)은 상품 단위다.
    expect(soldOutSendsByOption('coupang')).toBe(true);
    expect(soldOutSendsByOption('domeggook')).toBe(false);
  });

  /** 카카오 톡스토어 품절 = 판매자센터 [선택 수정]의 재고 0 · 올웨이즈 품절 = [품절] 버튼(2026-09-19 실측). 상품 단위다. */
  it('sends sold_out to 카카오 톡스토어 and 올웨이즈 through their seller centers', () => {
    for (const key of ['kakao', 'always']) {
      const mall = getMallAdapterManifest(key)!;
      expect(resolveSoldOutCommand(mall)).toEqual({ allowed: true, downgradedTo: 'sold_out' });
      expect(mall.soldOutRoute).toBe('mall_admin');
      expect(mall.supports.resume).toBe(true);
      expect(soldOutSendsByOption(key)).toBe(false);
    }
  });

  /** 아트공구 품절 = 카페24 상품목록의 [판매안함], 재개 = [판매함](2026-09-19 실측). 상품 단위다. */
  it('sends sold_out to 아트공구 as 판매안함 through the Cafe24 product list', () => {
    const art09 = getMallAdapterManifest('art09')!;
    expect(art09.unverified).toBe(false);
    expect(resolveSoldOutCommand(art09)).toEqual({ allowed: true, downgradedTo: 'sold_out' });
    expect(art09.soldOutRoute).toBe('mall_admin');
    expect(art09.resumeRoute).toBe('mall_admin');
    expect(art09.supports).toMatchObject({ setSaleStatus: 'listing', soldOut: true, resume: true, createListing: false });
    expect(soldOutSendsByOption('art09')).toBe(false);
  });

  /** 롯데ON 품절 = 판매자센터 상품정보일괄수정의 판매상태 품절(SOUT), 재개 = 판매중(SALE)(2026-09-19 실측). 상품 단위다. */
  it('sends sold_out to 롯데ON as sale status SOUT through the seller-center batch edit', () => {
    const lotteon = getMallAdapterManifest('lotte-on')!;
    expect(resolveSoldOutCommand(lotteon)).toEqual({ allowed: true, downgradedTo: 'sold_out' });
    expect(lotteon.soldOutRoute).toBe('mall_admin');
    expect(lotteon.resumeRoute).toBe('mall_admin');
    expect(soldOutSendsByOption('lotte-on')).toBe(false);
  });

  /**
   * 쇼핑몰 현황은 품절관리 · 판매재개를 칸 둘로 가른다(사장님 2026-09-19). 해제 길은 품절 길이 있고 몰이
   * 해제를 받을 때만 선다 — 우리 확장은 같은 화면 · 같은 요청의 반대 값으로 해제를 보낸다.
   */
  it('opens a resume route exactly where a sold-out route exists and the mall takes resume', () => {
    for (const manifest of MALL_ADAPTER_MANIFESTS) {
      expect(manifest.resumeRoute).toBe(
        manifest.soldOutRoute === 'mall_admin' && manifest.supports.resume ? 'mall_admin' : null,
      );
    }
    expect(getMallAdapterManifest('toss')!.resumeRoute).toBeNull();
    expect(getMallAdapterManifest('rocket')!.resumeRoute).toBeNull();
  });

  /** 티쳐몰 품절 = [실물] 일괄 업데이트의 재고 0(2026-09-19 실측) — 정보수정은 승인이 풀려 쓰지 않는다. 상품 단위다. */
  it('sends sold_out to 티쳐몰 as stock 0 through the batch update, not the approval-resetting edit', () => {
    const teacher = getMallAdapterManifest('teacher-mall')!;
    expect(resolveSoldOutCommand(teacher)).toEqual({ allowed: true, downgradedTo: 'sold_out' });
    expect(teacher.soldOutRoute).toBe('mall_admin');
    expect(teacher.resumeRoute).toBe('mall_admin');
    expect(teacher.hazards.updateResetsApproval).toBe(true);
    expect(soldOutSendsByOption('teacher-mall')).toBe(false);
  });

  /** 아이스크림몰 품절 = 판매상태 일괄변경 창의 품절(20), 재개 = 판매중(10)(2026-09-19 실측). 상품 단위다. */
  it('sends sold_out to 아이스크림몰 as sale status 20 through the sale-state batch window', () => {
    const icecream = getMallAdapterManifest('icecream-mall')!;
    expect(resolveSoldOutCommand(icecream)).toEqual({ allowed: true, downgradedTo: 'sold_out' });
    expect(icecream.soldOutRoute).toBe('mall_admin');
    expect(icecream.resumeRoute).toBe('mall_admin');
    expect(soldOutSendsByOption('icecream-mall')).toBe(false);
  });

  /** 키즈노트 품절 = 판매 상품 내역 [상태/노출일괄수정]의 품절(3), 재개 = 정상(2)(2026-09-19 실측). 상품 단위다. */
  it('sends sold_out to 키즈노트 as status 품절 through the state batch edit', () => {
    const kidsnote = getMallAdapterManifest('kidsnote')!;
    expect(resolveSoldOutCommand(kidsnote)).toEqual({ allowed: true, downgradedTo: 'sold_out' });
    expect(kidsnote.soldOutRoute).toBe('mall_admin');
    expect(kidsnote.resumeRoute).toBe('mall_admin');
    expect(soldOutSendsByOption('kidsnote')).toBe(false);
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
