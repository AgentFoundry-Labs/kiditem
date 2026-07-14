export type GlobalSourcingStageId = 'china' | 'global' | 'korea';

export type SourceIntegrationMode =
  | 'collector'
  | 'live-api'
  | 'research-snapshot'
  | 'linked-feature'
  | 'planned';

export interface GlobalSourcingStage {
  id: GlobalSourcingStageId;
  step: number;
  label: string;
  description: string;
  decision: string;
}

export interface GlobalSourcingSource {
  id: string;
  stage: GlobalSourcingStageId;
  label: string;
  signal: string;
  accessNote: string;
  evidenceUrl?: string;
  evidenceLabel?: string;
  integrationMode: SourceIntegrationMode;
}

export interface GlobalSourcingNextConnector {
  id: string;
  priority: number;
  label: string;
  signal: string;
  access: string;
  disclosure: string;
}

export const GLOBAL_SOURCING_STAGES: GlobalSourcingStage[] = [
  {
    id: 'china',
    step: 1,
    label: '중국 조기 포착',
    description: '공장·내수 소비·콘텐츠에서 먼저 나타나는 상품을 찾습니다.',
    decision: '무엇이 막 뜨기 시작했나',
  },
  {
    id: 'global',
    step: 2,
    label: '글로벌 반응 검증',
    description: '숏폼과 커머스 반응이 다른 시장으로 번지는지 확인합니다.',
    decision: '중국 밖에서도 반응하는가',
  },
  {
    id: 'korea',
    step: 3,
    label: '한국 선점 판단',
    description: '검색 수요와 판매 경쟁을 확인해 소량 검증 후보를 정합니다.',
    decision: '지금 한국에서 검증할 만한가',
  },
];

export const GLOBAL_SOURCING_SOURCES: GlobalSourcingSource[] = [
  {
    id: '1688',
    stage: 'china',
    label: '1688',
    signal: '시드 검색 결과·거래 표시값·신규 진입',
    accessNote: '로그인 세션 수집',
    evidenceUrl: 'https://aop.alibaba.com/',
    evidenceLabel: '공식 API 범위',
    integrationMode: 'collector',
  },
  {
    id: 'taobao',
    stage: 'china',
    label: '타오바오',
    signal: '제휴상품 30일 판매량·가격',
    accessNote: '공식 TBK API 후보',
    evidenceUrl: 'https://developer.alibaba.com/docs/api.htm?apiId=35896',
    evidenceLabel: '공식 API',
    integrationMode: 'planned',
  },
  {
    id: 'pdd',
    stage: 'china',
    label: '핀둬둬',
    signal: '제휴상품 판매 반응',
    accessNote: '파트너 승인 필요',
    evidenceUrl: 'https://open.yangkeduo.com/',
    evidenceLabel: '공식 API 범위',
    integrationMode: 'planned',
  },
  {
    id: 'xiaohongshu',
    stage: 'china',
    label: '샤오홍슈',
    signal: '게시물·저장 증가',
    accessNote: '공개 트렌드 API 없음',
    evidenceUrl: 'https://open.xiaohongshu.com/document/api',
    evidenceLabel: '공식 API 범위',
    integrationMode: 'planned',
  },
  {
    id: 'douyin',
    stage: 'china',
    label: '도우인',
    signal: '화제 순위·숏폼 반응',
    accessNote: '현재 리서치 스냅샷',
    evidenceUrl: 'https://developer.open-douyin.com/capacity-center-page/capacity-detail/7180550425647530045',
    evidenceLabel: '공식 화제 API',
    integrationMode: 'research-snapshot',
  },
  {
    id: 'youtube',
    stage: 'global',
    label: 'YouTube Shorts',
    signal: '문구·완구 최근 48시간 조회',
    accessNote: 'shortstrend 수집 스냅샷',
    integrationMode: 'collector',
  },
  {
    id: 'amazon',
    stage: 'global',
    label: 'Amazon Movers',
    signal: '24시간 판매순위 상승',
    accessNote: '공식 페이지·자동적재 검토',
    evidenceUrl: 'https://www.amazon.com/gp/movers-and-shakers',
    evidenceLabel: '공식 랭킹',
    integrationMode: 'planned',
  },
  {
    id: 'etsy',
    stage: 'global',
    label: 'Etsy',
    signal: '문구·DIY 검색·즐겨찾기',
    accessNote: '공식 API·판매량 미제공',
    evidenceUrl: 'https://developers.etsy.com/documentation/reference',
    evidenceLabel: '공식 API',
    integrationMode: 'planned',
  },
  {
    id: 'tiktok-shop',
    stage: 'global',
    label: 'TikTok Shop',
    signal: '상품·라이브 판매 반응',
    accessNote: '파트너 또는 상용 API',
    evidenceUrl: 'https://partner.tiktokshop.com/docv2/page/products-api-overview',
    evidenceLabel: '공식 API 범위',
    integrationMode: 'planned',
  },
  {
    id: 'naver',
    stage: 'korea',
    label: '네이버',
    signal: '검색량·검색지수·경쟁도',
    accessNote: '공식 API 화면 직접 조회',
    evidenceUrl: 'https://api.ncloud-docs.com/docs/naver-api-hub-search-trend',
    evidenceLabel: '공식 API',
    integrationMode: 'live-api',
  },
  {
    id: 'coupang',
    stage: 'korea',
    label: '쿠팡',
    signal: '자사 상품 순위·SERP',
    accessNote: '확장 기반 순위추적 기능 연결',
    integrationMode: 'linked-feature',
  },
  {
    id: 'ohouse',
    stage: 'korea',
    label: '오늘의집',
    signal: '생활·키즈 인기 상품',
    accessNote: '어댑터 없음',
    integrationMode: 'planned',
  },
];

export const GLOBAL_SOURCING_NEXT_CONNECTORS: GlobalSourcingNextConnector[] = [
  {
    id: 'taobao-tbk',
    priority: 1,
    label: '타오바오 TBK',
    signal: '제휴상품 30일 판매량을 매일 저장해 상승률 자체 계산',
    access: '공식 API · App Key/제휴 승인',
    disclosure: '타오바오 전체가 아닌 제휴 가능 상품 범위',
  },
  {
    id: 'fastmoss',
    priority: 2,
    label: 'FastMoss',
    signal: 'TikTok Shop 상품·샵·라이브 판매 반응',
    access: '상용 API · 유료 계약',
    disclosure: 'TikTok 공식값이 아닌 상용 추정 데이터',
  },
  {
    id: 'douyin-topic',
    priority: 3,
    label: 'Douyin 화제榜',
    signal: '최근 24시간 화제 순위와 순위 변동을 일 단위 수집',
    access: '공식 API · 권한 승인',
    disclosure: '상품 판매순위가 아닌 콘텐츠 화제 지표',
  },
  {
    id: 'rank1688',
    priority: 4,
    label: 'Rank1688',
    signal: '1688 카테고리·상품·공급업체 24시간 스냅샷 보강',
    access: '상용 서비스 · 계약 검토',
    disclosure: 'Alibaba 공식 데이터가 아니며 정확성 검증 필요',
  },
];

export function sourcesForStage(stage: GlobalSourcingStageId): GlobalSourcingSource[] {
  return GLOBAL_SOURCING_SOURCES.filter((source) => source.stage === stage);
}
