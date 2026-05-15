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
