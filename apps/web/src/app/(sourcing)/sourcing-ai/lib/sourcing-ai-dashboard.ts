export type TabId = 'overview' | 'trends' | 'new-products' | 'coupang' | 'recommendations';
export type TrendStage = 'rising' | 'watch' | 'crowded';
export type CandidateAction = 'track' | 'sample' | 'hold' | 'drop';

export interface SourcingTab {
  id: TabId;
  label: string;
  count: number;
}

export interface TrendKeyword {
  keyword: string;
  source: string;
  growthRate: number;
  newListings: number;
  reviewDelta: number;
  stage: TrendStage;
  signal: string;
}

export interface AlibabaSignal {
  id: string;
  title: string;
  category: string;
  cost: number;
  moq: number;
  supplierGrade: string;
  freshness: number;
  coupangKeyword: string;
  productDelta: number;
  visualClassName: string;
}

export interface CoupangTracker {
  keyword: string;
  firstSeen: string;
  trackedUrls: number;
  newProducts: number;
  reviewDelta: number;
  topRankShift: number;
  winner: string;
  status: string;
}

export interface SourcingCandidate {
  title: string;
  keyword: string;
  score: number;
  action: CandidateAction;
  margin: number;
  competition: string;
  risk: string;
  evidence: string;
}

export const tabs: SourcingTab[] = [
  { id: 'overview', label: '오버뷰', count: 4 },
  { id: 'trends', label: '트렌드', count: 12 },
  { id: 'new-products', label: '1688 신상품', count: 38 },
  { id: 'coupang', label: '쿠팡 검증', count: 9 },
  { id: 'recommendations', label: '소싱 추천', count: 5 },
];

export const trendKeywords: TrendKeyword[] = [
  {
    keyword: '유아 물놀이 스프링 매트',
    source: '1688 신규 + 쿠팡 검색어',
    growthRate: 184,
    newListings: 17,
    reviewDelta: 42,
    stage: 'rising',
    signal: '신규 등록과 리뷰 증가가 같이 움직임',
  },
  {
    keyword: '아기 휴대용 선풍기 클립',
    source: '쿠팡 신규상품순',
    growthRate: 96,
    newListings: 31,
    reviewDelta: 11,
    stage: 'crowded',
    signal: '상품 수는 빠르게 늘지만 강한 리뷰 상품이 이미 있음',
  },
  {
    keyword: '키즈 냉감 베개 커버',
    source: '1688 여름 신상',
    growthRate: 121,
    newListings: 9,
    reviewDelta: 18,
    stage: 'watch',
    signal: '카테고리 수요는 상승, 3일 추적 필요',
  },
  {
    keyword: '젤리슈즈 미끄럼방지',
    source: '쿠팡 검색 노출',
    growthRate: 73,
    newListings: 13,
    reviewDelta: 29,
    stage: 'rising',
    signal: '가격대가 낮고 신규 셀러 반응이 빠름',
  },
];

export const alibabaSignals: AlibabaSignal[] = [
  {
    id: 'ali-01',
    title: '물놀이 자동분사 매트',
    category: '야외완구',
    cost: 4200,
    moq: 12,
    supplierGrade: 'A',
    freshness: 92,
    coupangKeyword: '유아 물놀이 스프링 매트',
    productDelta: 17,
    visualClassName: 'bg-sky-100 text-sky-700',
  },
  {
    id: 'ali-02',
    title: '휴대용 쿨링 젤 베개',
    category: '침구',
    cost: 3300,
    moq: 20,
    supplierGrade: 'B+',
    freshness: 84,
    coupangKeyword: '키즈 냉감 베개 커버',
    productDelta: 9,
    visualClassName: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'ali-03',
    title: '캐릭터 EVA 젤리슈즈',
    category: '신발',
    cost: 5100,
    moq: 16,
    supplierGrade: 'A-',
    freshness: 77,
    coupangKeyword: '젤리슈즈 미끄럼방지',
    productDelta: 13,
    visualClassName: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'ali-04',
    title: '클립형 유모차 선풍기',
    category: '계절가전',
    cost: 7800,
    moq: 8,
    supplierGrade: 'A',
    freshness: 88,
    coupangKeyword: '아기 휴대용 선풍기 클립',
    productDelta: 31,
    visualClassName: 'bg-rose-100 text-rose-700',
  },
];

export const coupangTrackers: CoupangTracker[] = [
  {
    keyword: '유아 물놀이 스프링 매트',
    firstSeen: 'D-3',
    trackedUrls: 12,
    newProducts: 17,
    reviewDelta: 42,
    topRankShift: 8,
    winner: '리뷰 0 -> 19 신규 셀러',
    status: '소싱 우선',
  },
  {
    keyword: '키즈 냉감 베개 커버',
    firstSeen: 'D-2',
    trackedUrls: 8,
    newProducts: 9,
    reviewDelta: 18,
    topRankShift: 4,
    winner: '가격 12,900원대 셀러',
    status: '추적 유지',
  },
  {
    keyword: '아기 휴대용 선풍기 클립',
    firstSeen: 'D-3',
    trackedUrls: 19,
    newProducts: 31,
    reviewDelta: 11,
    topRankShift: -2,
    winner: '기존 리뷰 800+ 상품',
    status: '경쟁 과열',
  },
  {
    keyword: '젤리슈즈 미끄럼방지',
    firstSeen: 'D-1',
    trackedUrls: 7,
    newProducts: 13,
    reviewDelta: 29,
    topRankShift: 6,
    winner: '신규 로켓그로스 후보',
    status: '마진 확인',
  },
];

export const sourcingCandidates: SourcingCandidate[] = [
  {
    title: '물놀이 자동분사 매트',
    keyword: '유아 물놀이 스프링 매트',
    score: 91,
    action: 'sample',
    margin: 42,
    competition: '중간',
    risk: 'KC/안전 문구 확인',
    evidence: '3일 신규 17개, 리뷰 +42, 리뷰 강자 없음',
  },
  {
    title: '캐릭터 EVA 젤리슈즈',
    keyword: '젤리슈즈 미끄럼방지',
    score: 84,
    action: 'track',
    margin: 36,
    competition: '낮음',
    risk: '사이즈 클레임',
    evidence: 'D-1 신규 13개, 상위 신규상품 리뷰 반응 빠름',
  },
  {
    title: '휴대용 쿨링 젤 베개',
    keyword: '키즈 냉감 베개 커버',
    score: 76,
    action: 'track',
    margin: 31,
    competition: '중간',
    risk: '계절성',
    evidence: '검색어 상승 중, 아직 누적 리뷰 장벽 낮음',
  },
  {
    title: '클립형 유모차 선풍기',
    keyword: '아기 휴대용 선풍기 클립',
    score: 48,
    action: 'hold',
    margin: 24,
    competition: '높음',
    risk: '전기용품 인증',
    evidence: '상품 수 증가 대비 신규 리뷰 증가가 약함',
  },
];

export const actionLabels: Record<CandidateAction, string> = {
  track: '3일 추적',
  sample: '샘플 요청',
  hold: '보류',
  drop: '제외',
};
