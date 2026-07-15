import { describe, expect, it } from 'vitest';
import { buildCrossMarketTopics } from './cross-market-opportunities';

describe('buildCrossMarketTopics', () => {
  it('joins platform records only at stationery and toy topic level', () => {
    const topics = buildCrossMarketTopics({
      china: [
        { offerId: 'offer-1', sourceKeyword: '슬라임', title: '史莱姆水晶泥', monthlySales: 2300 },
      ],
      global: [
        { videoKey: 'video-1', keyword: '촉감·해소완구', title: '말랑이 거래', viewCount: 840000 },
      ],
      korea: [
        { id: 'naver-1', keyword: '스퀴시 슬라임', monthlySearches: 12000 },
      ],
    });

    expect(topics[0]).toMatchObject({
      id: 'sensory-relief',
      label: '촉감·해소완구',
      chinaOfferCount: 1,
      globalVideoCount: 1,
      koreaKeywordCount: 1,
      confirmedStageCount: 3,
      nextAction: '소량 검증 후보',
    });
  });

  it('keeps missing stages empty instead of inventing evidence', () => {
    const topics = buildCrossMarketTopics({
      china: [],
      global: [{ videoKey: 'video-1', keyword: '스티커·다꾸', title: null, viewCount: 1000 }],
      korea: [{ id: 'naver-1', keyword: '다꾸 스티커', monthlySearches: 7000 }],
    });

    expect(topics[0]).toMatchObject({
      chinaOfferCount: 0,
      globalVideoCount: 1,
      koreaKeywordCount: 1,
      confirmedStageCount: 2,
      nextAction: '1688 공급 확인',
    });
  });

  it('keeps unmatched custom seeds as single-source topics', () => {
    const topics = buildCrossMarketTopics({
      china: [{ offerId: 'offer-x', sourceKeyword: '자석 미로', title: null, monthlySales: null }],
      global: [],
      korea: [],
    });

    expect(topics[0]).toMatchObject({
      label: '자석 미로',
      chinaOfferCount: 1,
      globalVideoCount: 0,
      koreaKeywordCount: 0,
      nextAction: '글로벌 반응 확인',
    });
  });

  it('preserves licensed-keyword risk above sourcing actions', () => {
    const topics = buildCrossMarketTopics({
      china: [],
      global: [],
      korea: [
        {
          id: 'licensed-1',
          keyword: '터닝메카드',
          monthlySearches: 80000,
          rightsCheckRequired: true,
        },
      ],
    });

    expect(topics[0]).toMatchObject({
      rightsCheckRequired: true,
      nextAction: '권리 확인 후 검증',
    });
  });
});
