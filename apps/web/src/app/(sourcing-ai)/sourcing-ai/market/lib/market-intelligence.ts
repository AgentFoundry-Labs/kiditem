export type MarketCategory = 'all' | 'toy' | 'stationery';

export type TrendDecision = 'focus' | 'seasonal' | 'test' | 'licensed';

export type TrendSource = 'NAVER' | 'COUPANG' | 'WING' | 'DOUYIN' | 'YOUTUBE' | 'INSTAGRAM' | '1688';

export type TrendChannelView = 'all' | 'domestic' | 'social' | 'china';

export interface TrendPoint {
  date: string;
  search: number;
  commerce: number;
  social: number;
}

export interface SnsTrendVideo {
  title: string;
  channelName: string | null;
  viewCount: number | null;
  videoUrl: string | null;
}

/** 라이브 SNS(유튜브 쇼츠) 뷰에서만 채워지는 실측 근거. */
export interface SnsTrendEvidence {
  videoCount: number;
  totalViews: number;
  /** 이 키워드 쇼츠 중 발행 7일 이내 조회 비중(%) — 신선도. */
  freshShare: number;
  topVideos: SnsTrendVideo[];
}

export interface TrendOpportunity {
  id: string;
  keyword: string;
  category: Exclude<MarketCategory, 'all'>;
  trendRank: number;
  previousTrendRank: number | null;
  score: number;
  decision: TrendDecision;
  monthlySearches: number | null;
  shoppingRank: number | null;
  momentum: number;
  competition: '낮음' | '중간' | '높음';
  sources: TrendSource[];
  evidence: string;
  nextAction: string;
  points: TrendPoint[];
  /** 라이브 SNS 뷰 전용 실측 근거(쇼츠 영상). 정적 시드/타 뷰에서는 undefined. */
  snsEvidence?: SnsTrendEvidence;
}

export interface RankedTrendOpportunity {
  opportunity: TrendOpportunity;
  channelRank: number;
  channelScore: number;
  channelSources: TrendSource[];
}

export type RankStatus = 'rising' | 'falling' | 'steady';

export interface RankTrackingRow {
  id: string;
  keyword: string;
  productName: string;
  sku: string;
  organicRank: number;
  previousRank: number;
  sponsoredRank: number | null;
  conversionRate: number;
  views: number;
  sales: number;
  status: RankStatus;
  history: number[];
}

export interface CompetitorSignal {
  id: string;
  productName: string;
  brand: string;
  type: 'bundle' | 'creative' | 'price' | 'review';
  impact: 'high' | 'medium';
  metric: string;
  detail: string;
  observedAt: string;
}

export interface ChannelSignal {
  id: string;
  channel: TrendSource;
  title: string;
  value: string;
  change: string;
  detail: string;
  action: string;
}

const dates = ['07.06', '07.07', '07.08', '07.09', '07.10', '07.11', '07.12'];

function points(search: number[], commerce: number[], social: number[]): TrendPoint[] {
  return dates.map((date, index) => ({
    date,
    search: search[index],
    commerce: commerce[index],
    social: social[index],
  }));
}

export const trendOpportunities: TrendOpportunity[] = [
  {
    id: 'wax-ball',
    keyword: '왁뿌볼',
    category: 'toy',
    trendRank: 1,
    previousTrendRank: 3,
    score: 96,
    decision: 'focus',
    monthlySearches: 230_200,
    shoppingRank: 3,
    momentum: 24.8,
    competition: '중간',
    sources: ['NAVER', 'COUPANG', 'WING', 'DOUYIN'],
    evidence: '네이버 검색량 23만, Wing 28일 판매 4.7만개가 동시에 확인됐습니다.',
    nextAction: '일반 단품보다 2+1 세트와 촉감 차별화 SKU를 우선 검증하세요.',
    points: points(
      [52, 56, 61, 68, 76, 88, 96],
      [48, 54, 58, 64, 73, 86, 94],
      [40, 47, 55, 63, 75, 91, 98],
    ),
  },
  {
    id: 'malang',
    keyword: '말랑이',
    category: 'toy',
    trendRank: 2,
    previousTrendRank: 2,
    score: 93,
    decision: 'focus',
    monthlySearches: 184_000,
    shoppingRank: 8,
    momentum: 19.2,
    competition: '중간',
    sources: ['NAVER', 'COUPANG', 'WING', 'YOUTUBE'],
    evidence: 'Wing 28일 판매 9.6만개, 조회 221만회로 가장 넓은 모수입니다.',
    nextAction: '비누·과일·베이커리 모티프별 전환율을 나눠 추적하세요.',
    points: points(
      [58, 61, 65, 68, 75, 82, 91],
      [62, 64, 67, 72, 76, 83, 90],
      [48, 54, 61, 69, 74, 86, 92],
    ),
  },
  {
    id: 'keycap-keyring',
    keyword: '키캡 키링',
    category: 'stationery',
    trendRank: 3,
    previousTrendRank: 9,
    score: 92,
    decision: 'test',
    monthlySearches: null,
    shoppingRank: null,
    momentum: 43.6,
    competition: '중간',
    sources: ['INSTAGRAM', 'COUPANG', 'YOUTUBE', '1688'],
    evidence: '인스타그램 언급이 2025년 12월 대비 2026년 2월 137%, 관련어 156% 상승했습니다.',
    nextAction: '비IP 알파벳·MBTI DIY 키캡 세트를 소량 검증하세요.',
    points: points(
      [24, 29, 35, 43, 54, 67, 82],
      [20, 25, 31, 39, 49, 62, 76],
      [35, 43, 53, 65, 78, 91, 100],
    ),
  },
  {
    id: 'crunch-slime',
    keyword: '크런치슬랑이',
    category: 'toy',
    trendRank: 4,
    previousTrendRank: 7,
    score: 91,
    decision: 'focus',
    monthlySearches: 96_300,
    shoppingRank: 5,
    momentum: 31.4,
    competition: '중간',
    sources: ['NAVER', 'COUPANG', 'WING', 'YOUTUBE'],
    evidence: '쇼핑 일간 5위와 ASMR형 상품 판매 증가가 함께 나타났습니다.',
    nextAction: '첫 1초에 깨지는 장면이 보이는 숏폼 소재를 제작하세요.',
    points: points(
      [41, 44, 51, 59, 67, 78, 92],
      [36, 42, 48, 57, 70, 83, 95],
      [50, 55, 61, 72, 84, 94, 99],
    ),
  },
  {
    id: 'needoh-stress-ball',
    keyword: '니도 스트레스볼',
    category: 'toy',
    trendRank: 5,
    previousTrendRank: null,
    score: 88,
    decision: 'licensed',
    monthlySearches: null,
    shoppingRank: null,
    momentum: 51.2,
    competition: '높음',
    sources: ['INSTAGRAM', 'YOUTUBE', 'COUPANG'],
    evidence: '올해 9주 만에 1년치 재고가 소진됐고 위조품 경고가 함께 확인됐습니다.',
    nextAction: '공식 유통 증빙이 확인되는 SKU만 검토하세요.',
    points: points(
      [30, 35, 42, 50, 61, 74, 88],
      [27, 33, 40, 49, 60, 76, 93],
      [38, 47, 57, 68, 80, 92, 100],
    ),
  },
  {
    id: 'bolkku',
    keyword: '볼꾸',
    category: 'stationery',
    trendRank: 6,
    previousTrendRank: 12,
    score: 86,
    decision: 'test',
    monthlySearches: null,
    shoppingRank: null,
    momentum: 39.8,
    competition: '낮음',
    sources: ['INSTAGRAM', 'YOUTUBE', '1688'],
    evidence: '2026년 4월 SNS 기반 볼펜 꾸미기 소비 트렌드가 확인됐습니다.',
    nextAction: '비IP 참·리필 결합 키트를 30~100개 단위로 검증하세요.',
    points: points(
      [18, 22, 27, 34, 42, 53, 66],
      [15, 19, 24, 30, 38, 48, 61],
      [31, 39, 48, 58, 70, 84, 97],
    ),
  },
  {
    id: 'water-gun',
    keyword: '물총',
    category: 'toy',
    trendRank: 7,
    previousTrendRank: 10,
    score: 88,
    decision: 'seasonal',
    monthlySearches: 34_850,
    shoppingRank: 2,
    momentum: 42.1,
    competition: '중간',
    sources: ['NAVER', 'COUPANG', '1688'],
    evidence: '완구 쇼핑 2위지만 7~8월에 수요가 집중되는 짧은 시즌형 신호입니다.',
    nextAction: '주 단위 소량 보충으로 재고 종료 시점을 먼저 정하세요.',
    points: points(
      [28, 34, 42, 54, 69, 85, 97],
      [24, 31, 39, 53, 68, 88, 100],
      [20, 28, 35, 48, 61, 79, 91],
    ),
  },
  {
    id: 'slangi',
    keyword: '슬랑이',
    category: 'toy',
    trendRank: 8,
    previousTrendRank: 8,
    score: 90,
    decision: 'focus',
    monthlySearches: 119_900,
    shoppingRank: null,
    momentum: 27.8,
    competition: '높음',
    sources: ['NAVER', 'COUPANG', 'WING', 'YOUTUBE'],
    evidence: '네이버 월간 11.9만 검색과 Wing 하위 키워드 확장이 동시에 확인됐습니다.',
    nextAction: '모키워드보다 촉감·형태별 세부 SKU로 나눠 검증하세요.',
    points: points(
      [47, 51, 55, 62, 70, 82, 91],
      [44, 49, 55, 60, 68, 79, 88],
      [42, 48, 56, 65, 75, 88, 96],
    ),
  },
  {
    id: 'crunch-malang',
    keyword: '크런치말랑이',
    category: 'toy',
    trendRank: 9,
    previousTrendRank: 13,
    score: 89,
    decision: 'focus',
    monthlySearches: 54_430,
    shoppingRank: null,
    momentum: 38.6,
    competition: '중간',
    sources: ['NAVER', 'WING', 'YOUTUBE', '1688'],
    evidence: '네이버 월간 5.4만 검색과 깨짐 ASMR 숏폼 반응이 함께 상승했습니다.',
    nextAction: '단면 노출과 소리 훅을 3초 소재로 제작해 소량 검증하세요.',
    points: points(
      [32, 36, 42, 51, 63, 78, 91],
      [29, 35, 40, 49, 60, 76, 90],
      [45, 52, 61, 70, 82, 93, 99],
    ),
  },
  {
    id: 'soap-slime',
    keyword: '비누슬랑이',
    category: 'toy',
    trendRank: 10,
    previousTrendRank: 14,
    score: 87,
    decision: 'focus',
    monthlySearches: 16_740,
    shoppingRank: null,
    momentum: 26.2,
    competition: '중간',
    sources: ['NAVER', 'WING', 'YOUTUBE', '1688'],
    evidence: '네이버 월간 1.67만 검색과 자사 추적 SKU의 TOP 20 신호가 겹칩니다.',
    nextAction: '향·색상 2종 세트와 KC 안심 문구 조합을 테스트하세요.',
    points: points(
      [35, 40, 45, 52, 60, 70, 81],
      [38, 42, 46, 53, 61, 72, 84],
      [44, 49, 55, 63, 71, 83, 91],
    ),
  },
  {
    id: 'electric-water-gun',
    keyword: '전동물총',
    category: 'toy',
    trendRank: 11,
    previousTrendRank: 17,
    score: 85,
    decision: 'seasonal',
    monthlySearches: 25_030,
    shoppingRank: null,
    momentum: 55.3,
    competition: '높음',
    sources: ['NAVER', 'COUPANG', 'YOUTUBE', '1688'],
    evidence: '월간 2.5만 검색과 여름 커머스 급등이 겹친 짧은 시즌형 신호입니다.',
    nextAction: '배터리·누수 검수 조건을 먼저 확정하고 주 단위로 보충하세요.',
    points: points(
      [22, 28, 35, 46, 61, 79, 96],
      [20, 27, 34, 45, 62, 82, 100],
      [18, 24, 31, 43, 58, 75, 91],
    ),
  },
  {
    id: 'perler-beads',
    keyword: '펄러비즈',
    category: 'stationery',
    trendRank: 12,
    previousTrendRank: null,
    score: 78,
    decision: 'test',
    monthlySearches: 3_430,
    shoppingRank: null,
    momentum: 48,
    competition: '높음',
    sources: ['DOUYIN', '1688', 'NAVER'],
    evidence: '중국 拼豆 소비가 전월 대비 48% 증가했지만 국내 검색은 아직 초기입니다.',
    nextAction: '스타터 키트 1종과 리필 2종을 30~100개 단위로 테스트하세요.',
    points: points(
      [18, 20, 24, 29, 35, 42, 50],
      [16, 19, 23, 28, 33, 40, 48],
      [38, 47, 58, 69, 80, 92, 100],
    ),
  },
  {
    id: 'bead-craft',
    keyword: '비즈공예',
    category: 'stationery',
    trendRank: 13,
    previousTrendRank: 16,
    score: 77,
    decision: 'test',
    monthlySearches: 7_030,
    shoppingRank: null,
    momentum: 41.2,
    competition: '중간',
    sources: ['NAVER', 'YOUTUBE', 'DOUYIN', '1688'],
    evidence: '국내 검색은 월 7천 수준이지만 Douyin·YouTube 제작 영상이 선행합니다.',
    nextAction: '초등 입문 키트와 리필을 묶어 30~100개 단위로 테스트하세요.',
    points: points(
      [21, 24, 29, 35, 43, 53, 65],
      [18, 22, 26, 32, 39, 49, 60],
      [37, 44, 52, 61, 71, 84, 96],
    ),
  },
  {
    id: 'polymer-clay',
    keyword: '폴리머클레이',
    category: 'stationery',
    trendRank: 14,
    previousTrendRank: 18,
    score: 72,
    decision: 'test',
    monthlySearches: 4_840,
    shoppingRank: null,
    momentum: 36.7,
    competition: '중간',
    sources: ['YOUTUBE', 'NAVER', '1688'],
    evidence: '글로벌 영상 관심은 높지만 국내 검색량은 아직 소규모입니다.',
    nextAction: '미니어처 입문 키트로 소재·도구를 함께 묶어 테스트하세요.',
    points: points(
      [20, 22, 25, 29, 34, 39, 45],
      [14, 17, 20, 23, 27, 32, 38],
      [43, 50, 59, 68, 79, 90, 98],
    ),
  },
  {
    id: 'journal',
    keyword: '다꾸',
    category: 'stationery',
    trendRank: 15,
    previousTrendRank: 11,
    score: 68,
    decision: 'test',
    monthlySearches: 4_250,
    shoppingRank: null,
    momentum: 18.4,
    competition: '높음',
    sources: ['YOUTUBE', 'NAVER', '1688'],
    evidence: '저널링 숏폼은 성장 중이지만 범용 검색 수요는 아직 작습니다.',
    nextAction: '테마형 스티커·PET·와시테이프 묶음으로 객단가를 검증하세요.',
    points: points(
      [28, 30, 32, 35, 38, 42, 47],
      [18, 20, 22, 24, 27, 30, 34],
      [46, 51, 58, 64, 72, 81, 89],
    ),
  },
  {
    id: 'pokemon-card',
    keyword: '포켓몬카드',
    category: 'toy',
    trendRank: 16,
    previousTrendRank: 1,
    score: 76,
    decision: 'licensed',
    monthlySearches: 222_300,
    shoppingRank: 1,
    momentum: 12.6,
    competition: '높음',
    sources: ['NAVER', 'COUPANG'],
    evidence: '수요는 가장 강하지만 정품 유통 증빙과 라이선스 리스크가 우선입니다.',
    nextAction: '공식 유통 경로와 매입증빙을 확보한 SKU만 후보로 남기세요.',
    points: points(
      [79, 81, 84, 86, 90, 93, 96],
      [75, 78, 82, 84, 88, 92, 95],
      [60, 61, 64, 68, 70, 73, 76],
    ),
  },
  {
    id: 'rilakkuma-malang',
    keyword: '리락쿠마말랑이',
    category: 'toy',
    trendRank: 17,
    previousTrendRank: null,
    score: 64,
    decision: 'licensed',
    monthlySearches: 44_960,
    shoppingRank: null,
    momentum: 34.9,
    competition: '높음',
    sources: ['NAVER', 'COUPANG', 'YOUTUBE'],
    evidence: '월간 4.5만 수요는 강하지만 캐릭터 권리 확인이 선행돼야 합니다.',
    nextAction: '공식 유통 증빙이 없는 후보는 소싱 큐에서 제외하세요.',
    points: points(
      [41, 47, 52, 58, 65, 75, 86],
      [39, 43, 48, 55, 62, 73, 84],
      [45, 51, 58, 67, 76, 88, 97],
    ),
  },
  {
    id: 'deform-block',
    keyword: '디폼블럭',
    category: 'toy',
    trendRank: 18,
    previousTrendRank: 19,
    score: 80,
    decision: 'test',
    monthlySearches: 12_870,
    shoppingRank: null,
    momentum: 32.8,
    competition: '중간',
    sources: ['NAVER', 'COUPANG', 'DOUYIN', '1688'],
    evidence: '월간 1.29만 국내 수요와 중국 픽셀 공예 선행 신호가 연결됩니다.',
    nextAction: '비IP 도안 스타터 키트로 부품 구성과 안전성을 검증하세요.',
    points: points(
      [29, 34, 40, 48, 57, 68, 79],
      [26, 31, 36, 43, 52, 63, 75],
      [40, 47, 55, 63, 72, 84, 94],
    ),
  },
  {
    id: 'book-cover',
    keyword: '북커버',
    category: 'stationery',
    trendRank: 19,
    previousTrendRank: 20,
    score: 81,
    decision: 'seasonal',
    monthlySearches: 28_940,
    shoppingRank: null,
    momentum: 29.7,
    competition: '중간',
    sources: ['NAVER', 'COUPANG', 'YOUTUBE', '1688'],
    evidence: '월간 2.9만 검색과 독서·신학기 시즌 선행 신호가 함께 상승했습니다.',
    nextAction: '사이즈 호환표와 방수 소재를 차별점으로 세트 검증하세요.',
    points: points(
      [28, 32, 37, 43, 51, 61, 73],
      [24, 29, 34, 40, 48, 59, 70],
      [33, 38, 44, 51, 59, 69, 81],
    ),
  },
  {
    id: 'pencil-case',
    keyword: '필통',
    category: 'stationery',
    trendRank: 20,
    previousTrendRank: 15,
    score: 78,
    decision: 'seasonal',
    monthlySearches: 20_480,
    shoppingRank: null,
    momentum: 17.6,
    competition: '높음',
    sources: ['NAVER', 'COUPANG', '1688'],
    evidence: '월간 2.05만 검색이 학기 전 수요와 함께 다시 오르고 있습니다.',
    nextAction: '대용량·투명·스탠딩형을 분리해 전환율을 비교하세요.',
    points: points(
      [40, 43, 46, 50, 55, 61, 68],
      [38, 40, 43, 47, 52, 58, 65],
      [31, 34, 37, 42, 47, 54, 62],
    ),
  },
];

export const rankTrackingRows: RankTrackingRow[] = [
  {
    id: 'rank-wax',
    keyword: '왁뿌볼',
    productName: '자사 왁뿌볼 말랑이 3개 세트',
    sku: 'KID-WAX-03',
    organicRank: 18,
    previousRank: 31,
    sponsoredRank: 4,
    conversionRate: 10.9,
    views: 26_958,
    sales: 2_950,
    status: 'rising',
    history: [36, 33, 31, 28, 24, 21, 18],
  },
  {
    id: 'rank-crunch',
    keyword: '크런치슬랑이',
    productName: '자사 망고 크런치 슬랑이',
    sku: 'KID-CRU-01',
    organicRank: 42,
    previousRank: 35,
    sponsoredRank: 8,
    conversionRate: 5.7,
    views: 58_940,
    sales: 3_346,
    status: 'falling',
    history: [29, 31, 33, 35, 37, 40, 42],
  },
  {
    id: 'rank-soap',
    keyword: '비누슬랑이',
    productName: '자사 비누 슬랑이 2종 세트',
    sku: 'KID-SOP-02',
    organicRank: 11,
    previousRank: 15,
    sponsoredRank: 3,
    conversionRate: 4.4,
    views: 84_061,
    sales: 3_738,
    status: 'rising',
    history: [22, 19, 18, 16, 14, 13, 11],
  },
  {
    id: 'rank-water',
    keyword: '물총',
    productName: '자사 유아 물총 2개 세트',
    sku: 'KID-WAT-02',
    organicRank: 64,
    previousRank: 52,
    sponsoredRank: 12,
    conversionRate: 3.8,
    views: 19_420,
    sales: 738,
    status: 'falling',
    history: [47, 49, 52, 54, 58, 61, 64],
  },
  {
    id: 'rank-beads',
    keyword: '펄러비즈',
    productName: '자사 픽셀비즈 스타터 키트',
    sku: 'KID-BEA-01',
    organicRank: 79,
    previousRank: 82,
    sponsoredRank: null,
    conversionRate: 2.1,
    views: 4_620,
    sales: 97,
    status: 'steady',
    history: [86, 84, 82, 81, 80, 80, 79],
  },
];

export const competitorSignals: CompetitorSignal[] = [
  {
    id: 'competitor-bundle',
    productName: '왁뿌볼 2+1 세트',
    brand: '아르르',
    type: 'bundle',
    impact: 'high',
    metric: '전환율 10.9%',
    detail: '단품 가격 비교보다 3개 구성의 체감 혜택을 전면에 배치했습니다.',
    observedAt: '오늘 11:20',
  },
  {
    id: 'competitor-creative',
    productName: '크런치 슬랑이',
    brand: '하루랩',
    type: 'creative',
    impact: 'high',
    metric: '28일 3,346개',
    detail: '망고 단면과 깨지는 순간을 첫 이미지·숏폼 훅으로 사용합니다.',
    observedAt: '오늘 10:40',
  },
  {
    id: 'competitor-review',
    productName: '비누슬랑이',
    brand: '칠시',
    type: 'review',
    impact: 'medium',
    metric: '조회 84,061회',
    detail: 'KC·선물·로켓배송 문구로 구매 불안을 동시에 낮추고 있습니다.',
    observedAt: '어제 18:10',
  },
  {
    id: 'competitor-price',
    productName: '버터 말랑이',
    brand: '루아르모',
    type: 'price',
    impact: 'medium',
    metric: '판매가 3,170원',
    detail: '저가 단품으로 진입한 뒤 연관 상품으로 확장하는 가격 구조입니다.',
    observedAt: '어제 15:35',
  },
];

export const channelSignals: ChannelSignal[] = [
  {
    id: 'channel-douyin',
    channel: 'DOUYIN',
    title: '拼豆 · 픽셀비즈',
    value: '+48%',
    change: '전월 대비 공동구매 소비',
    detail: '중국 선행 수요가 강하지만 국내 검색은 초기 단계입니다.',
    action: '스타터+리필 소량 테스트',
  },
  {
    id: 'channel-youtube',
    channel: 'YOUTUBE',
    title: '폴리머클레이 미니어처',
    value: '3억+',
    change: '글로벌 연간 영상 조회',
    detail: '완제품보다 만드는 과정과 결과 공개형 콘텐츠가 강합니다.',
    action: '입문 키트 콘텐츠 테스트',
  },
  {
    id: 'channel-coupang',
    channel: 'COUPANG',
    title: '물놀이 완구',
    value: '2위',
    change: '완구 쇼핑 일간 순위',
    detail: '물총·버블건·워터매트가 동시에 상승한 계절 신호입니다.',
    action: '주 단위 재고 보충',
  },
  {
    id: 'channel-wing',
    channel: 'WING',
    title: '말랑이 시장',
    value: '9.6만',
    change: '최근 28일 판매 수량',
    detail: '모키워드는 크지만 촉감·모티프별 전환 차이가 큽니다.',
    action: '하위 키워드별 순위 분리',
  },
];

export function filterTrendOpportunities(
  opportunities: TrendOpportunity[],
  category: MarketCategory,
  query: string,
): TrendOpportunity[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');

  return opportunities.filter((opportunity) => {
    if (category !== 'all' && opportunity.category !== category) return false;
    if (!normalizedQuery) return true;

    return [opportunity.keyword, opportunity.evidence, opportunity.nextAction]
      .some((value) => value.toLocaleLowerCase('ko-KR').includes(normalizedQuery));
  });
}

const channelViewSources: Record<Exclude<TrendChannelView, 'all'>, TrendSource[]> = {
  domestic: ['NAVER', 'COUPANG', 'WING'],
  social: ['INSTAGRAM', 'YOUTUBE'],
  china: ['DOUYIN', '1688'],
};

export function trendSourcesForChannelView(
  opportunity: TrendOpportunity,
  view: TrendChannelView,
): TrendSource[] {
  if (view === 'all') return opportunity.sources;
  const allowedSources = new Set<TrendSource>(channelViewSources[view]);
  return opportunity.sources.filter((source) => allowedSources.has(source));
}

export function channelOpportunityScore(
  opportunity: TrendOpportunity,
  view: TrendChannelView,
): number {
  if (view === 'all') return opportunity.score;

  const latestPoint = opportunity.points.at(-1) ?? { search: 0, commerce: 0, social: 0 };
  const sourceCoverage = trendSourcesForChannelView(opportunity, view).length / channelViewSources[view].length;

  const score = view === 'domestic'
    ? latestPoint.search * 0.4 + latestPoint.commerce * 0.45 + sourceCoverage * 15
    : view === 'social'
      ? latestPoint.social * 0.8 + sourceCoverage * 20
      : latestPoint.social * 0.5 + latestPoint.commerce * 0.25 + sourceCoverage * 25;

  return Math.round(Math.min(100, score));
}

export function rankTrendOpportunitiesForChannel(
  opportunities: TrendOpportunity[],
  view: TrendChannelView,
): RankedTrendOpportunity[] {
  const ranked = opportunities
    .map((opportunity) => ({
      opportunity,
      channelRank: opportunity.trendRank,
      channelScore: channelOpportunityScore(opportunity, view),
      channelSources: trendSourcesForChannelView(opportunity, view),
    }))
    .filter((row) => view === 'all' || row.channelSources.length > 0);

  if (view === 'all') {
    return ranked.sort((a, b) => a.opportunity.trendRank - b.opportunity.trendRank);
  }

  return ranked
    .sort((a, b) => (
      b.channelScore - a.channelScore
      || b.opportunity.momentum - a.opportunity.momentum
      || a.opportunity.trendRank - b.opportunity.trendRank
    ))
    .map((row, index) => ({ ...row, channelRank: index + 1 }));
}

export function rankMovement(currentRank: number, previousRank: number): number {
  return previousRank - currentRank;
}

export function visibilityShare(rows: RankTrackingRow[], threshold = 20): number {
  if (rows.length === 0) return 0;
  return (rows.filter((row) => row.organicRank <= threshold).length / rows.length) * 100;
}
