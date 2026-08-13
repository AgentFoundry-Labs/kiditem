import { describe, expect, it } from 'vitest';
import {
  buildEntryRecommendations,
  type EntryInterestKeyword,
  type EntryPopularKeyword,
  type EntryRisingCandidate,
  type EntrySupplyItem,
} from '../sourcing-entry-recommendation';
import { recommendationItemKey } from '../sourcing-recommendation-identity';

const TODAY = new Date('2026-08-04T00:00:00.000Z');

function supplyItem(overrides: Partial<EntrySupplyItem> = {}): EntrySupplyItem {
  const sourceUrl = overrides.sourceUrl ?? 'https://detail.1688.com/offer/619235900570.html';
  const externalOfferId =
    overrides.externalOfferId ?? sourceUrl?.match(/offer\/(\d+)/)?.[1] ?? '619235900570';

  return {
    title: '여아 여름 원피스',
    keyword: '여아원피스',
    imageUrl: 'https://cbu01.alicdn.com/a.jpg',
    sourceUrl,
    externalOfferId,
    priceCny: 31,
    landedCostKrw: 7690,
    targetSalePriceKrw: 27780,
    estimatedProfitKrw: 14090,
    estimatedMarginRate: 50.7,
    minOrderQuantity: 1,
    serviceScore: 4.5,
    repurchaseRate: '57%',
    shippingFulfillmentRate: '100%',
    supplierName: '湖州童四春电子商务有限公司',
    purchaseTags: ['선결제 후배송'],
    supplierTags: ['제품 시연 영상'],
    matchedCoupang: { productId: '9436343850', productName: '경쟁 원피스', salePrice: 27780, reviews: 45 },
    ...overrides,
  };
}

function popularKeyword(overrides: Partial<EntryPopularKeyword> = {}): EntryPopularKeyword {
  return {
    keyword: '여아원피스',
    boardKey: 'toys_dolls',
    boardLabel: '완구/인형',
    businessDate: new Date('2026-08-03T00:00:00.000Z'),
    rank: 1,
    ...overrides,
  };
}

function build(input: {
  supplyItems?: EntrySupplyItem[];
  risingCandidates?: EntryRisingCandidate[];
  popularKeywords?: EntryPopularKeyword[];
  interestKeywords?: EntryInterestKeyword[];
  supplyBusinessDate?: string | null;
  risingBusinessDate?: string | null;
  limit?: number;
}) {
  return buildEntryRecommendations({
    supplyItems: input.supplyItems ?? [],
    risingCandidates: input.risingCandidates ?? [],
    popularKeywords: input.popularKeywords ?? [],
    interestKeywords: input.interestKeywords ?? [],
    supplyBusinessDate: input.supplyBusinessDate ?? '2026-07-25',
    risingBusinessDate: input.risingBusinessDate ?? '2026-07-24',
    today: TODAY,
    limit: input.limit ?? 50,
  });
}

describe('buildEntryRecommendations', () => {
  it('공급 아이템을 표 행으로 변환하고 순위를 매긴다', () => {
    const result = build({ supplyItems: [supplyItem()], popularKeywords: [popularKeyword()] });

    expect(result.items).toHaveLength(1);
    const [item] = result.items;
    expect(item.rank).toBe(1);
    expect(item.title).toBe('여아 여름 원피스');
    expect(item.overseasMall).toBe('1688');
    expect(item.overseasPriceKrw).toBe(7690);
    expect(item.salePriceKrw).toBe(27780);
    expect(item.rating).toBe(4.5);
    expect(item.tags).toEqual(['선결제 후배송', '제품 시연 영상']);
    expect(item.id).toBe(
      recommendationItemKey({
        sourcePlatform: '1688',
        externalOfferId: '619235900570',
        variantKey: '',
        matchedCoupangProductId: '9436343850',
      }),
    );
  });

  it('같은 오퍼가 다른 쿠팡 상품에 매칭되면 서로 다른 id 를 갖는다', () => {
    const result = build({
      supplyItems: [
        supplyItem({ title: 'A', matchedCoupang: { productId: '111' } }),
        supplyItem({ title: 'B', matchedCoupang: { productId: '222' } }),
      ],
    });
    const ids = result.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('쿠팡 매칭이 없으면 오퍼 id 만으로 키를 만든다', () => {
    const result = build({ supplyItems: [supplyItem({ matchedCoupang: null })] });
    expect(result.items[0].id).toBe(
      recommendationItemKey({
        sourcePlatform: '1688',
        externalOfferId: '619235900570',
        variantKey: '',
        matchedCoupangProductId: null,
      }),
    );
  });

  it('외부 오퍼 식별자가 없으면 제목이나 행 번호로 추천을 만들지 않는다', () => {
    const result = build({ supplyItems: [supplyItem({ externalOfferId: ' ' })] });

    expect(result.items).toEqual([]);
  });

  it('제목이 없는 행은 버린다', () => {
    const result = build({ supplyItems: [supplyItem({ title: '   ' })] });
    expect(result.items).toHaveLength(0);
  });

  it('마진율이 높을수록 점수가 높다', () => {
    const high = build({ supplyItems: [supplyItem({ estimatedMarginRate: 50 })] }).items[0];
    const low = build({ supplyItems: [supplyItem({ estimatedMarginRate: 10 })] }).items[0];
    expect(high.components.margin).toBeGreaterThan(low.components.margin);
    expect(high.score).toBeGreaterThan(low.score);
  });

  it('경쟁 리뷰가 많을수록 경쟁 여유도가 낮다', () => {
    const shallow = build({ supplyItems: [supplyItem({ matchedCoupang: { reviews: 10 } })] }).items[0];
    const saturated = build({ supplyItems: [supplyItem({ matchedCoupang: { reviews: 5000 } })] }).items[0];
    expect(shallow.components.competition).toBeGreaterThan(saturated.components.competition);
    expect(saturated.components.competition).toBe(0);
  });

  it('쿠팡 매칭이 없으면 경쟁 여유도를 만점이 아니라 중립(50)으로 둔다', () => {
    const result = build({ supplyItems: [supplyItem({ matchedCoupang: null })] });
    expect(result.items[0].components.competition).toBe(50);
    expect(result.items[0].risks).toContain('쿠팡 매칭 상품 없음 — 판매가/경쟁 강도 미확인');
  });

  it('MOQ 가 낮을수록 공급 점수가 높다', () => {
    const small = build({ supplyItems: [supplyItem({ minOrderQuantity: 1 })] }).items[0];
    const bulk = build({ supplyItems: [supplyItem({ minOrderQuantity: 200 })] }).items[0];
    expect(small.components.supplier).toBeGreaterThan(bulk.components.supplier);
    expect(bulk.risks.some((risk) => risk.includes('최소주문'))).toBe(true);
  });

  it('인기 보드에 잡힌 키워드는 수요 점수를 받는다', () => {
    const withTrend = build({
      supplyItems: [supplyItem()],
      popularKeywords: [popularKeyword({ rank: 1 })],
    }).items[0];
    const withoutTrend = build({ supplyItems: [supplyItem()] }).items[0];

    expect(withTrend.components.demand).toBeGreaterThan(0);
    expect(withoutTrend.components.demand).toBe(0);
    expect(withoutTrend.risks).toContain('검색 수요 근거 없음 — 키워드 트렌드/급상승 어디에도 안 잡힘');
  });

  it('직전 일자에 없던 키워드만 신규로 표시한다', () => {
    const result = build({
      supplyItems: [supplyItem()],
      popularKeywords: [
        popularKeyword({ keyword: '여아원피스', businessDate: new Date('2026-08-03T00:00:00.000Z') }),
        popularKeyword({ keyword: '다른키워드', businessDate: new Date('2026-08-02T00:00:00.000Z') }),
      ],
    });
    expect(result.items[0].isNewKeyword).toBe(true);
  });

  it('일자가 하나뿐이면 전부 신규로 표시하지 않는다', () => {
    const result = build({ supplyItems: [supplyItem()], popularKeywords: [popularKeyword()] });
    expect(result.items[0].isNewKeyword).toBe(false);
  });

  it('보드 키워드가 상품 키워드에 포함되면 부분 일치로 잡는다', () => {
    const result = build({
      supplyItems: [supplyItem({ keyword: '여아원피스' })],
      popularKeywords: [popularKeyword({ keyword: '원피스', rank: 3 })],
    });
    expect(result.items[0].components.demand).toBeGreaterThan(0);
  });

  it('급상승 후보와 이어지면 모멘텀 점수와 근거가 붙는다', () => {
    const rising: EntryRisingCandidate = {
      keyword: '여아원피스',
      score: 69,
      signals: { rankClimb: 44, monthlySearchVolume: 41_360 },
    };
    const result = build({ supplyItems: [supplyItem()], risingCandidates: [rising] });

    expect(result.items[0].components.momentum).toBe(69);
    expect(result.items[0].reasons.some((r) => r.includes('44계단 상승'))).toBe(true);
    expect(result.items[0].contributingSources).toContain('coupang_rising');
  });

  it('기여한 소스만 contributingSources 에 넣는다', () => {
    const result = build({ supplyItems: [supplyItem({ matchedCoupang: null })] });
    expect(result.items[0].contributingSources).toEqual(['supply_1688_new']);
  });

  it('소스가 비면 이유를 dataGaps 로 남긴다', () => {
    const result = build({ supplyItems: [] });

    expect(result.items).toHaveLength(0);
    expect(result.dataGaps).toContain('1688 신상품 데이터 없음 — 해당 소스는 점수에 반영되지 않았습니다.');
    expect(result.dataGaps).toContain('추천 가능한 상품이 없습니다 — 1688 신상품 수집을 먼저 실행하세요.');
  });

  it('오래된 소스는 경과일을 남긴다', () => {
    const result = build({ supplyItems: [supplyItem()], supplyBusinessDate: '2026-07-25' });
    const supply = result.sources.find((s) => s.key === 'supply_1688_new');

    expect(supply?.staleDays).toBe(10);
    expect(result.dataGaps.some((gap) => gap.includes('10일 경과'))).toBe(true);
  });

  it('limit 을 넘는 행은 자른다', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      supplyItem({ title: `상품 ${i}`, sourceUrl: `https://detail.1688.com/offer/${i}.html` }),
    );
    const result = build({ supplyItems: items, limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.rank)).toEqual([1, 2]);
  });

  it('점수 내림차순으로 정렬한다', () => {
    const result = build({
      supplyItems: [
        supplyItem({ title: '낮음', estimatedMarginRate: 5, sourceUrl: 'https://detail.1688.com/offer/1.html' }),
        supplyItem({ title: '높음', estimatedMarginRate: 55, sourceUrl: 'https://detail.1688.com/offer/2.html' }),
      ],
    });
    expect(result.items.map((item) => item.title)).toEqual(['높음', '낮음']);
  });

  it('등급은 점수 구간을 따른다', () => {
    const strong = build({
      supplyItems: [supplyItem()],
      popularKeywords: [popularKeyword()],
      risingCandidates: [{ keyword: '여아원피스', score: 90, signals: { monthlySearchVolume: 50_000 } }],
    }).items[0];
    expect(strong.grade).toBe('A');

    const weak = build({
      supplyItems: [supplyItem({ estimatedMarginRate: 1, minOrderQuantity: 500, serviceScore: 1 })],
    }).items[0];
    expect(weak.grade).toBe('WATCH');
  });

  it('한 키워드가 표를 독점하지 않도록 상위 3개까지만 남긴다', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      supplyItem({
        title: `포켓몬카드 변종 ${i}`,
        keyword: '포켓몬카드',
        sourceUrl: `https://detail.1688.com/offer/${100 + i}.html`,
      }),
    );
    const result = build({ supplyItems: items });
    expect(result.items).toHaveLength(3);
  });

  it('키워드별 상한은 다른 키워드의 노출을 막지 않는다', () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) =>
        supplyItem({
          title: `카드 ${i}`,
          keyword: '포켓몬카드',
          estimatedMarginRate: 60,
          sourceUrl: `https://detail.1688.com/offer/${200 + i}.html`,
        }),
      ),
      supplyItem({
        title: '원피스',
        keyword: '여아원피스',
        estimatedMarginRate: 10,
        sourceUrl: 'https://detail.1688.com/offer/999.html',
      }),
    ];
    const result = build({ supplyItems: items });

    expect(result.items).toHaveLength(4);
    expect(result.items.map((item) => item.keyword)).toContain('여아원피스');
  });

  it('키워드가 없는 행은 상한 대상이 아니다', () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      supplyItem({
        title: `무키워드 ${i}`,
        keyword: null,
        matchedCoupang: null,
        sourceUrl: `https://detail.1688.com/offer/${300 + i}.html`,
      }),
    );
    const result = build({ supplyItems: items });
    expect(result.items).toHaveLength(6);
  });

  describe('관심 키워드 분류', () => {
    const interest: EntryInterestKeyword[] = [
      { keyword: '레고테크닉', origin: 'saved' },
      { keyword: '슬라임', origin: 'seed' },
    ];

    it('관심 키워드와 정확히 같으면 exact 로 표시한다', () => {
      const result = build({
        supplyItems: [supplyItem({ title: '레고 테크닉 세트', keyword: '레고테크닉' })],
        interestKeywords: interest,
      });

      expect(result.items[0].interest).toEqual({
        tier: 'exact',
        keywords: ['레고테크닉'],
        origins: ['saved'],
        matches: [{ keyword: '레고테크닉', tier: 'exact' }],
      });
    });

    it('상품명에만 걸리면 related 로 표시한다', () => {
      const result = build({
        supplyItems: [supplyItem({ title: '말랑 슬라임 대용량 키트', keyword: '장난감' })],
        interestKeywords: interest,
      });

      expect(result.items[0].interest?.tier).toBe('related');
      expect(result.items[0].interest?.keywords).toEqual(['슬라임']);
      expect(result.items[0].interest?.origins).toEqual(['seed']);
    });

    it('관심 키워드에 걸리지 않으면 null 이다', () => {
      const result = build({
        supplyItems: [supplyItem({ title: '여아 원피스', keyword: '여아원피스' })],
        interestKeywords: interest,
      });
      expect(result.items[0].interest).toBeNull();
    });

    it('점수는 그대로 두고 순서만 앞으로 올린다', () => {
      const items = [
        supplyItem({
          title: '고득점 무관심',
          keyword: '여아원피스',
          estimatedMarginRate: 60,
          sourceUrl: 'https://detail.1688.com/offer/1.html',
        }),
        supplyItem({
          title: '저득점 관심',
          keyword: '레고테크닉',
          estimatedMarginRate: 5,
          sourceUrl: 'https://detail.1688.com/offer/2.html',
        }),
      ];
      const result = build({ supplyItems: items, interestKeywords: interest });

      expect(result.items[0].title).toBe('저득점 관심');
      // 점수 자체는 관심 여부로 부풀리지 않는다.
      expect(result.items[0].score).toBeLessThan(result.items[1].score);
    });

    it('관심 키워드에는 더 많은 후보를 허용한다', () => {
      const items = Array.from({ length: 8 }, (_, i) =>
        supplyItem({
          title: `레고 테크닉 ${i}`,
          keyword: '레고테크닉',
          sourceUrl: `https://detail.1688.com/offer/${400 + i}.html`,
        }),
      );
      const result = build({ supplyItems: items, interestKeywords: interest });
      expect(result.items).toHaveLength(6);
    });

    it('키워드별 후보 수를 집계하고 0건이면 사유를 남긴다', () => {
      const result = build({
        supplyItems: [supplyItem({ title: '레고 테크닉 세트', keyword: '레고테크닉' })],
        interestKeywords: interest,
      });

      const lego = result.interestKeywords.find((entry) => entry.keyword === '레고테크닉');
      const slime = result.interestKeywords.find((entry) => entry.keyword === '슬라임');
      expect(lego).toMatchObject({ origins: ['saved'], exactCount: 1, relatedCount: 0, state: 'candidates' });
      expect(slime).toMatchObject({ origins: ['seed'], exactCount: 0, relatedCount: 0, state: 'no_signal' });
      expect(result.dataGaps.some((gap) => gap.includes('슬라임'))).toBe(true);
    });

    it('공급 후보는 없지만 수요가 잡히면 demand_only 로 구분한다', () => {
      const result = build({
        supplyItems: [supplyItem({ title: '여아 원피스', keyword: '여아원피스' })],
        interestKeywords: [{ keyword: '슬라임', origin: 'seed' }],
        risingCandidates: [
          { keyword: '슬라임', score: 69, signals: { monthlySearchVolume: 41_360 } },
        ],
      });

      const slime = result.interestKeywords[0];
      expect(slime.state).toBe('demand_only');
      expect(slime.demand).toMatchObject({ risingScore: 69, monthlySearchVolume: 41_360 });
      expect(
        result.dataGaps.some((gap) => gap.includes('수요는 확인되는데 1688 공급 후보가 없습니다')),
      ).toBe(true);
    });

    it('수요도 공급도 없으면 no_signal 이고 안내 문구가 다르다', () => {
      const result = build({
        supplyItems: [supplyItem()],
        interestKeywords: [{ keyword: '존재하지않는키워드', origin: 'saved' }],
      });

      expect(result.interestKeywords[0].state).toBe('no_signal');
      expect(result.interestKeywords[0].demand).toBeNull();
      expect(
        result.dataGaps.some((gap) => gap.includes('수요 신호도 공급 후보도 없습니다')),
      ).toBe(true);
    });

    it('같은 키워드가 두 출처에 있으면 출처를 합친다', () => {
      const result = build({
        supplyItems: [supplyItem({ title: '슬라임 키트', keyword: '슬라임' })],
        interestKeywords: [
          { keyword: '슬라임', origin: 'saved' },
          { keyword: '슬라임', origin: 'seed' },
        ],
      });
      expect(result.items[0].interest?.origins.sort()).toEqual(['saved', 'seed']);
    });

    it('다른 키워드가 exact 로 이겨도 related 매칭을 집계에서 잃지 않는다', () => {
      const result = build({
        supplyItems: [supplyItem({ keyword: '원피스', title: '여아 원피스 여름 아동복' })],
        interestKeywords: [
          { keyword: '원피스', origin: 'saved' },
          { keyword: '여아원피스', origin: 'seed' },
        ],
      });

      const exactHit = result.interestKeywords.find((entry) => entry.keyword === '원피스');
      const relatedHit = result.interestKeywords.find((entry) => entry.keyword === '여아원피스');
      expect(exactHit).toMatchObject({ exactCount: 1, state: 'candidates' });
      // exact 승자에 가려 0건으로 집계되던 버그. 이 키워드도 후보를 갖고 있다.
      expect(relatedHit).toMatchObject({ relatedCount: 1, state: 'candidates' });
      expect(result.dataGaps.some((gap) => gap.includes('여아원피스'))).toBe(false);
    });

    it('같은 키워드가 두 출처에 등록돼도 상태 행은 하나만 만든다', () => {
      const result = build({
        supplyItems: [supplyItem({ title: '슬라임 키트', keyword: '슬라임' })],
        interestKeywords: [
          { keyword: '슬라임', origin: 'saved' },
          { keyword: '슬라임', origin: 'seed' },
        ],
      });
      expect(result.interestKeywords).toHaveLength(1);
      expect(result.interestKeywords[0].origins.slice().sort()).toEqual(['saved', 'seed']);
    });

    it('관심 키워드가 없으면 아무 행도 표시되지 않는다', () => {
      const result = build({ supplyItems: [supplyItem()], interestKeywords: [] });
      expect(result.items[0].interest).toBeNull();
      expect(result.interestKeywords).toEqual([]);
    });

    it('한 글자 관심 키워드는 무시한다', () => {
      const result = build({
        supplyItems: [supplyItem({ title: '아무 상품', keyword: '테스트' })],
        interestKeywords: [{ keyword: '아', origin: 'saved' }],
      });
      expect(result.items[0].interest).toBeNull();
      expect(result.interestKeywords).toEqual([]);
    });
  });

  it('배송비를 모를 때 무료라고 적지 않는다', () => {
    const known = build({ supplyItems: [supplyItem({ landedCostKrw: 7690 })] }).items[0];
    const unknown = build({ supplyItems: [supplyItem({ landedCostKrw: null })] }).items[0];
    expect(known.shippingLabel).toBe('통관가 포함');
    expect(unknown.shippingLabel).toBe('미확인');
  });
});
