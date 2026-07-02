export type KeywordStage = 'rising' | 'watch' | 'crowded' | 'blocked';
export type SourcingAction = 'source_now' | 'track' | 'hold' | 'drop';
export type SourcePlatform = '1688' | 'taobao';
export type CostConfidence = 'confirmed' | 'estimated' | 'missing';

export interface DemandSignal {
  searchVolume: number;
  registeredProducts: number;
  newProductDelta: number;
  reviewDelta: number;
  avgSalePrice: number;
  competitionScore: number;
  signal: string;
  freshness: string;
  rankMovement: number;
  priceStability: number;
}

export interface CostStructure {
  targetSalePrice: number;
  coupangFeeRate: number;
  platformFee: number;
  logisticsCost: number;
  domesticShipping: number;
  landedUnitCost: number;
  netProfit: number;
  marginRate: number;
}

export interface SourceOffer {
  id: string;
  platform: SourcePlatform;
  title: string;
  sourceUrl: string;
  imageUrl: string;
  priceCny: number;
  chinaShippingCny: number;
  moq: number;
  supplierGrade: string;
  monthlySales: number;
  imageCount: number;
  optionCount: number;
  serviceFeeKrw: number;
  internationalShippingKrw: number;
  taxEstimateKrw: number;
  inspectionFeeKrw: number;
  landedCostKrw: number;
  costConfidence: CostConfidence;
  recommendation: string;
}

export interface SourcingDecisionRow {
  id: string;
  keyword: string;
  category: string;
  stage: KeywordStage;
  score: number;
  action: SourcingAction;
  demand: DemandSignal;
  cost: CostStructure;
  source: SourceOffer;
  sourceCandidates: SourceOffer[];
  risks: string[];
  nextStep: string;
}

export interface PipelineStage {
  id: string;
  title: string;
  metric: string;
  description: string;
}

export const pipelineStages: PipelineStage[] = [
  {
    id: 'radar',
    title: '키워드 레이더',
    metric: '쿠팡 자동 발견',
    description: '스크래퍼가 카테고리와 상품명에서 신규 키워드를 계속 찾습니다.',
  },
  {
    id: 'coupang',
    title: '쿠팡 시장 반응',
    metric: '신규등록·리뷰·랭킹',
    description: '신규 상품이 실제 반응을 얻는지 확인합니다.',
  },
  {
    id: 'criteria',
    title: '소싱 기준',
    metric: '수요·경쟁·리스크',
    description: '기준을 넘은 키워드만 해외 상품 후보로 넘깁니다.',
  },
  {
    id: 'overseas',
    title: '해외 상품 선택',
    metric: '1688·타오바오 후보',
    description: '여러 해외 후보 중 사람이 실제 소싱 상품을 선택합니다.',
  },
];

const waterMatOffer: SourceOffer = {
  id: 'water-mat-1688-a',
  platform: '1688',
  title: '儿童喷水戏水垫户外玩具',
  sourceUrl: 'https://detail.1688.com/offer/example-water-mat.html',
  imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=220&q=80',
  priceCny: 8.6,
  chinaShippingCny: 1.2,
  moq: 12,
  supplierGrade: 'A',
  monthlySales: 8200,
  imageCount: 12,
  optionCount: 4,
  serviceFeeKrw: 250,
  internationalShippingKrw: 1150,
  taxEstimateKrw: 420,
  inspectionFeeKrw: 300,
  landedCostKrw: 3980,
  costConfidence: 'estimated',
  recommendation: '이미지 수와 판매량이 가장 안정적',
};

const gelShoesOffer: SourceOffer = {
  id: 'gel-shoes-1688-a',
  platform: '1688',
  title: '儿童洞洞鞋夏季防滑凉鞋',
  sourceUrl: 'https://detail.1688.com/offer/example-gel-shoes.html',
  imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=220&q=80',
  priceCny: 7.8,
  chinaShippingCny: 0.9,
  moq: 16,
  supplierGrade: 'A-',
  monthlySales: 13900,
  imageCount: 8,
  optionCount: 18,
  serviceFeeKrw: 220,
  internationalShippingKrw: 980,
  taxEstimateKrw: 360,
  inspectionFeeKrw: 280,
  landedCostKrw: 3490,
  costConfidence: 'estimated',
  recommendation: '단가는 좋지만 옵션 관리가 큼',
};

const pillowOffer: SourceOffer = {
  id: 'cool-pillow-1688-a',
  platform: '1688',
  title: '儿童凉感枕套夏季卡通冰丝',
  sourceUrl: 'https://detail.1688.com/offer/example-cool-pillow.html',
  imageUrl: 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=220&q=80',
  priceCny: 10.3,
  chinaShippingCny: 1.5,
  moq: 20,
  supplierGrade: 'B+',
  monthlySales: 5200,
  imageCount: 6,
  optionCount: 7,
  serviceFeeKrw: 260,
  internationalShippingKrw: 1320,
  taxEstimateKrw: 510,
  inspectionFeeKrw: 300,
  landedCostKrw: 4630,
  costConfidence: 'missing',
  recommendation: '소재 검증 전까지 추적',
};

const fanOffer: SourceOffer = {
  id: 'clip-fan-1688-a',
  platform: '1688',
  title: '婴儿车夹扇USB充电小风扇',
  sourceUrl: 'https://detail.1688.com/offer/example-clip-fan.html',
  imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=220&q=80',
  priceCny: 27.2,
  chinaShippingCny: 2.8,
  moq: 8,
  supplierGrade: 'A',
  monthlySales: 18000,
  imageCount: 17,
  optionCount: 5,
  serviceFeeKrw: 410,
  internationalShippingKrw: 1680,
  taxEstimateKrw: 890,
  inspectionFeeKrw: 450,
  landedCostKrw: 9120,
  costConfidence: 'estimated',
  recommendation: '인증 확인 전 보류',
};

export const sourcingRows: SourcingDecisionRow[] = [
  {
    id: 'kid-water-bubble-mat',
    keyword: '유아 물놀이 스프링 매트',
    category: '완구/물놀이',
    stage: 'rising',
    score: 91,
    action: 'source_now',
    demand: {
      searchVolume: 18500,
      registeredProducts: 720,
      newProductDelta: 17,
      reviewDelta: 42,
      avgSalePrice: 15900,
      competitionScore: 38,
      signal: '신규 등록과 리뷰가 같이 움직임',
      freshness: '쿠팡 12분 전',
      rankMovement: 18,
      priceStability: 82,
    },
    cost: {
      targetSalePrice: 15900,
      coupangFeeRate: 10.8,
      platformFee: 1717,
      logisticsCost: 4791,
      domesticShipping: 3000,
      landedUnitCost: 1855,
      netProfit: 4537,
      marginRate: 28.5,
    },
    source: waterMatOffer,
    sourceCandidates: [
      waterMatOffer,
      {
        ...waterMatOffer,
        id: 'water-mat-taobao-b',
        platform: 'taobao',
        title: '夏季儿童喷水垫加厚款',
        priceCny: 11.8,
        chinaShippingCny: 0,
        moq: 2,
        supplierGrade: 'B+',
        monthlySales: 3100,
        imageCount: 9,
        optionCount: 3,
        landedCostKrw: 4430,
        recommendation: 'MOQ가 낮아 샘플 확인에 적합',
      },
    ],
    risks: ['KC 안전 문구', '계절성', '물류 부피'],
    nextStep: '샘플 요청',
  },
  {
    id: 'gel-shoes-nonslip',
    keyword: '젤리슈즈 미끄럼방지',
    category: '유아동/신발',
    stage: 'rising',
    score: 84,
    action: 'track',
    demand: {
      searchVolume: 9200,
      registeredProducts: 360,
      newProductDelta: 13,
      reviewDelta: 29,
      avgSalePrice: 12900,
      competitionScore: 31,
      signal: '리뷰 장벽 낮고 신규 셀러 반응 빠름',
      freshness: '쿠팡 18분 전',
      rankMovement: 11,
      priceStability: 76,
    },
    cost: {
      targetSalePrice: 12900,
      coupangFeeRate: 10.8,
      platformFee: 1393,
      logisticsCost: 4052,
      domesticShipping: 3000,
      landedUnitCost: 1680,
      netProfit: 2775,
      marginRate: 21.5,
    },
    source: gelShoesOffer,
    sourceCandidates: [
      gelShoesOffer,
      {
        ...gelShoesOffer,
        id: 'gel-shoes-1688-b',
        title: '儿童凉拖防滑洞洞鞋批发',
        priceCny: 6.9,
        chinaShippingCny: 1.4,
        moq: 30,
        supplierGrade: 'B',
        monthlySales: 9400,
        imageCount: 11,
        optionCount: 24,
        landedCostKrw: 3340,
        recommendation: '단가는 낮지만 MOQ와 옵션 수가 큼',
      },
    ],
    risks: ['사이즈 클레임', '옵션 관리', '색상 랜덤'],
    nextStep: '3일 추적',
  },
  {
    id: 'cooling-pillow-cover',
    keyword: '키즈 냉감 베개 커버',
    category: '침구/계절',
    stage: 'watch',
    score: 76,
    action: 'track',
    demand: {
      searchVolume: 6400,
      registeredProducts: 1095,
      newProductDelta: 9,
      reviewDelta: 18,
      avgSalePrice: 14900,
      competitionScore: 54,
      signal: '수요 상승 중이나 기존 상품 수가 많음',
      freshness: '쿠팡 31분 전',
      rankMovement: 7,
      priceStability: 64,
    },
    cost: {
      targetSalePrice: 14900,
      coupangFeeRate: 10.8,
      platformFee: 1609,
      logisticsCost: 5702,
      domesticShipping: 3000,
      landedUnitCost: 2230,
      netProfit: 2359,
      marginRate: 15.8,
    },
    source: pillowOffer,
    sourceCandidates: [
      pillowOffer,
      {
        ...pillowOffer,
        id: 'cool-pillow-taobao-b',
        platform: 'taobao',
        title: '儿童冰丝枕套卡通单只装',
        priceCny: 13.5,
        chinaShippingCny: 0,
        moq: 1,
        supplierGrade: 'B',
        monthlySales: 1600,
        imageCount: 5,
        optionCount: 9,
        landedCostKrw: 4920,
        recommendation: '샘플 확인용, 양산 후보는 아님',
      },
    ],
    risks: ['마진 낮음', '계절성', '소재 표현 검증'],
    nextStep: '마진 재계산',
  },
  {
    id: 'clip-stroller-fan',
    keyword: '아기 휴대용 선풍기 클립',
    category: '계절가전',
    stage: 'blocked',
    score: 48,
    action: 'hold',
    demand: {
      searchVolume: 22500,
      registeredProducts: 1920,
      newProductDelta: 31,
      reviewDelta: 11,
      avgSalePrice: 19900,
      competitionScore: 82,
      signal: '상품 수 증가 대비 신규 리뷰 반응 약함',
      freshness: '쿠팡 9분 전',
      rankMovement: -3,
      priceStability: 41,
    },
    cost: {
      targetSalePrice: 19900,
      coupangFeeRate: 10.8,
      platformFee: 2149,
      logisticsCost: 5125,
      domesticShipping: 3000,
      landedUnitCost: 5950,
      netProfit: 3676,
      marginRate: 18.5,
    },
    source: fanOffer,
    sourceCandidates: [
      fanOffer,
      {
        ...fanOffer,
        id: 'clip-fan-taobao-b',
        platform: 'taobao',
        title: '婴儿推车夹扇静音款',
        priceCny: 32.5,
        chinaShippingCny: 0,
        moq: 1,
        supplierGrade: 'A-',
        monthlySales: 7200,
        imageCount: 14,
        optionCount: 4,
        landedCostKrw: 10150,
        recommendation: '샘플은 쉽지만 인증 리스크 동일',
      },
    ],
    risks: ['전기용품 인증', '경쟁 과열', 'AS 리스크'],
    nextStep: '보류',
  },
];

export const actionLabels: Record<SourcingAction, string> = {
  source_now: '샘플 요청',
  track: '3일 추적',
  hold: '보류',
  drop: '제외',
};

export const stageLabels: Record<KeywordStage, string> = {
  rising: '상승',
  watch: '관찰',
  crowded: '과열',
  blocked: '리스크',
};

export interface SourcingReport {
  id: string;
  title: string;
  category: string;
  dateLabel: string;
  status: 'ready' | 'watch';
  summary: string;
  recommendationReasons: string[];
  startGuide: string;
  caution: string;
  wholesaleKeywords: string[];
  searchTrend: Array<{ label: string; value: number }>;
  priceAnalysis: {
    naverAvgKrw: number;
    wholesaleAvgKrw: number;
    estimatedMarginRate: number;
  };
  sourceRowId: string;
}

export interface TrendKeyword {
  rank: number;
  keyword: string;
  category: string;
  searchVolume: number;
  productCount: number;
  competition: number;
  movement: number;
  isSurging?: boolean;
}

export interface WholesaleProduct {
  id: string;
  title: string;
  category: string;
  imageUrl: string;
  priceKrw: number;
  shippingKrw: number;
  minOrder: number;
  detailImageStatus: 'usable' | 'unavailable' | 'checking';
}

export interface WholesaleCategory {
  id: string;
  label: string;
  children: string[];
}

export const sourcingReports: SourcingReport[] = [
  {
    id: 'report-water-mat',
    title: '유아 물놀이 스프링 매트',
    category: '여름 필수템',
    dateLabel: '5월 17일 리포트',
    status: 'ready',
    summary: '초여름 물놀이 준비 수요가 올라오면서 신규 등록과 리뷰 반응이 같이 움직입니다.',
    recommendationReasons: [
      '최근 신규 등록 상품 대비 리뷰 증가가 빠르게 붙고 있어 초기 반응 확인이 가능합니다.',
      '단가가 낮고 부피가 얇아 세트 구성으로 객단가를 올리기 좋습니다.',
      'KC 안전 문구와 사용 연령 고지만 정리하면 상세페이지 설득 포인트가 명확합니다.',
    ],
    startGuide: '물놀이 시즌성 이미지를 전면에 두고, 접이식 보관과 야외 사용 장면을 강조하세요.',
    caution: '물 접촉 완구 표현과 안전 고지를 상세페이지 하단에 분리해 명시해야 합니다.',
    wholesaleKeywords: ['유아 물놀이 매트', '스프링 매트', '야외 물놀이'],
    searchTrend: [
      { label: '04.12', value: 58 },
      { label: '04.19', value: 72 },
      { label: '04.26', value: 86 },
      { label: '05.03', value: 91 },
      { label: '05.10', value: 78 },
    ],
    priceAnalysis: {
      naverAvgKrw: 15900,
      wholesaleAvgKrw: 3980,
      estimatedMarginRate: 63,
    },
    sourceRowId: 'kid-water-bubble-mat',
  },
  {
    id: 'report-gel-shoes',
    title: '젤리슈즈 미끄럼방지',
    category: '유아동 신발',
    dateLabel: '5월 17일 리포트',
    status: 'ready',
    summary: '장마 전후로 가벼운 방수 신발 수요가 늘고, 리뷰 장벽이 낮은 편입니다.',
    recommendationReasons: [
      '신규 셀러도 리뷰 확보 속도가 빨라 초기 테스트 상품으로 적합합니다.',
      '색상과 사이즈 옵션이 많아 묶음 옵션 설계로 전환율을 높일 수 있습니다.',
      '미끄럼방지, 발등 보호, 물빠짐 구조를 상세 이미지로 보여주기 좋습니다.',
    ],
    startGuide: '옵션 수가 많으므로 대표 색상 3개부터 시작하고, 사이즈표를 크게 노출하세요.',
    caution: '사이즈 클레임이 잦을 수 있으니 실측표와 교환 기준을 먼저 정리해야 합니다.',
    wholesaleKeywords: ['아동 젤리슈즈', '미끄럼방지 샌들', '물놀이 신발'],
    searchTrend: [
      { label: '04.12', value: 43 },
      { label: '04.19', value: 61 },
      { label: '04.26', value: 73 },
      { label: '05.03', value: 88 },
      { label: '05.10', value: 92 },
    ],
    priceAnalysis: {
      naverAvgKrw: 12900,
      wholesaleAvgKrw: 3490,
      estimatedMarginRate: 55,
    },
    sourceRowId: 'gel-shoes-nonslip',
  },
  {
    id: 'report-cooling-pillow',
    title: '키즈 냉감 베개 커버',
    category: '침구/계절',
    dateLabel: '5월 16일 리포트',
    status: 'watch',
    summary: '더위 대비 수요는 올라오지만 기존 상품 수가 많아 소재 차별화가 필요합니다.',
    recommendationReasons: [
      '계절 키워드 검색량은 상승 중이라 관찰 가치가 있습니다.',
      '캐릭터 패턴과 세탁 편의성을 묶으면 키즈 침구 카테고리에 맞습니다.',
      '냉감 원단 인증이나 소재 근거가 있으면 경쟁 상품과 구분됩니다.',
    ],
    startGuide: '상세페이지 첫 구간에서 냉감 소재와 세탁 편의성을 같이 보여주세요.',
    caution: '냉감 효과 표현은 과장 문구를 피하고 소재 정보 중심으로 구성해야 합니다.',
    wholesaleKeywords: ['키즈 냉감 베개', '여름 베개 커버', '아동 침구'],
    searchTrend: [
      { label: '04.12', value: 39 },
      { label: '04.19', value: 48 },
      { label: '04.26', value: 62 },
      { label: '05.03', value: 70 },
      { label: '05.10', value: 74 },
    ],
    priceAnalysis: {
      naverAvgKrw: 14900,
      wholesaleAvgKrw: 4630,
      estimatedMarginRate: 43,
    },
    sourceRowId: 'cooling-pillow-cover',
  },
  {
    id: 'report-clip-fan',
    title: '아기 휴대용 선풍기 클립',
    category: '인증 관찰',
    dateLabel: '5월 16일 리포트',
    status: 'watch',
    summary: '검색량은 높지만 전기용품 인증과 AS 리스크가 있어 바로 판매하기 어렵습니다.',
    recommendationReasons: [
      '여름 시즌 검색량은 크지만 경쟁 상품 수가 이미 빠르게 늘고 있습니다.',
      '인증 확보 여부가 판매 가능성을 크게 좌우합니다.',
      '클립 안정성, 배터리 지속시간, 소음 정보를 검증해야 합니다.',
    ],
    startGuide: '인증 가능한 공급사를 먼저 찾고, 상세페이지는 안전/소음/배터리 근거 중심으로 준비하세요.',
    caution: 'KC 인증 없이 판매하면 등록 단계에서 막히거나 판매 후 리스크가 큽니다.',
    wholesaleKeywords: ['유모차 선풍기', '휴대용 클립팬', '아기 선풍기'],
    searchTrend: [
      { label: '04.12', value: 55 },
      { label: '04.19', value: 77 },
      { label: '04.26', value: 89 },
      { label: '05.03', value: 95 },
      { label: '05.10', value: 82 },
    ],
    priceAnalysis: {
      naverAvgKrw: 19900,
      wholesaleAvgKrw: 9120,
      estimatedMarginRate: 28,
    },
    sourceRowId: 'clip-stroller-fan',
  },
];

export const trendKeywords: TrendKeyword[] = [
  {
    rank: 1,
    keyword: '물놀이 매트',
    category: '완구/물놀이',
    searchVolume: 18500,
    productCount: 720,
    competition: 0.38,
    movement: 18,
  },
  {
    rank: 2,
    keyword: '젤리슈즈',
    category: '유아동/신발',
    searchVolume: 9200,
    productCount: 360,
    competition: 0.31,
    movement: 11,
  },
  {
    rank: 3,
    keyword: '유모차 선풍기',
    category: '계절가전',
    searchVolume: 22500,
    productCount: 1920,
    competition: 0.82,
    movement: -3,
    isSurging: true,
  },
  {
    rank: 4,
    keyword: '냉감 베개 커버',
    category: '침구/계절',
    searchVolume: 6400,
    productCount: 1095,
    competition: 0.54,
    movement: 7,
  },
  {
    rank: 5,
    keyword: '아동 우비',
    category: '유아동/의류',
    searchVolume: 11800,
    productCount: 840,
    competition: 0.46,
    movement: 9,
  },
  {
    rank: 6,
    keyword: '방수 네임스티커',
    category: '문구',
    searchVolume: 7600,
    productCount: 510,
    competition: 0.28,
    movement: 4,
  },
  {
    rank: 7,
    keyword: '유아 썬캡',
    category: '패션잡화',
    searchVolume: 8300,
    productCount: 930,
    competition: 0.57,
    movement: 2,
  },
  {
    rank: 8,
    keyword: '여름 낮잠 이불',
    category: '침구/계절',
    searchVolume: 5400,
    productCount: 420,
    competition: 0.35,
    movement: 6,
  },
  {
    rank: 9,
    keyword: '모래놀이 세트',
    category: '완구/놀이',
    searchVolume: 12800,
    productCount: 1010,
    competition: 0.49,
    movement: 5,
  },
  {
    rank: 10,
    keyword: '아이스 쿨토시',
    category: '생활/건강',
    searchVolume: 6900,
    productCount: 780,
    competition: 0.52,
    movement: -1,
  },
];

export const wholesaleCategories: WholesaleCategory[] = [
  {
    id: 'all',
    label: '전체',
    children: ['문구', '유아동 패션', '완구', '생활/침구'],
  },
  {
    id: 'stationery',
    label: '문구',
    children: ['방수 네임스티커', '책갈피', '스티커', '명찰/이름표'],
  },
  {
    id: 'kids-fashion',
    label: '유아동 패션',
    children: ['젤리슈즈', '우비', '썬캡', '장갑'],
  },
  {
    id: 'toys',
    label: '완구',
    children: ['물놀이', '모래놀이', '역할놀이', '감각놀이'],
  },
  {
    id: 'home',
    label: '생활/침구',
    children: ['냉감 침구', '수납', '욕실', '계절용품'],
  },
];

export const wholesaleProducts: WholesaleProduct[] = [
  {
    id: 'wholesale-water-mat',
    title: '유아 야외 물놀이 매트 분수매트',
    category: '완구/물놀이',
    imageUrl: waterMatOffer.imageUrl,
    priceKrw: 3980,
    shippingKrw: 3000,
    minOrder: 12,
    detailImageStatus: 'usable',
  },
  {
    id: 'wholesale-gel-shoes',
    title: '아동 미끄럼방지 젤리슈즈 색상 랜덤',
    category: '유아동 패션',
    imageUrl: gelShoesOffer.imageUrl,
    priceKrw: 3490,
    shippingKrw: 3000,
    minOrder: 16,
    detailImageStatus: 'usable',
  },
  {
    id: 'wholesale-cooling-pillow',
    title: '키즈 냉감 베개 커버 여름 침구',
    category: '생활/침구',
    imageUrl: pillowOffer.imageUrl,
    priceKrw: 4630,
    shippingKrw: 3000,
    minOrder: 20,
    detailImageStatus: 'checking',
  },
  {
    id: 'wholesale-name-sticker',
    title: '어린이집 방수 네임스티커 주문제작',
    category: '문구',
    imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=420&q=80',
    priceKrw: 580,
    shippingKrw: 3000,
    minOrder: 50,
    detailImageStatus: 'usable',
  },
  {
    id: 'wholesale-clip-fan',
    title: '유모차 휴대용 클립 선풍기 USB 충전',
    category: '계절가전',
    imageUrl: fanOffer.imageUrl,
    priceKrw: 9120,
    shippingKrw: 3000,
    minOrder: 8,
    detailImageStatus: 'unavailable',
  },
  {
    id: 'wholesale-sand-toy',
    title: '여름 모래놀이 도구 세트',
    category: '완구/놀이',
    imageUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=420&q=80',
    priceKrw: 2100,
    shippingKrw: 3000,
    minOrder: 24,
    detailImageStatus: 'usable',
  },
];
