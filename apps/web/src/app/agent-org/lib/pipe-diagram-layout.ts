import {
  ArrowRightLeft,
  Bookmark,
  Brain,
  Calculator,
  ChartNoAxesCombined,
  Check,
  Clapperboard,
  Crosshair,
  Database,
  Download,
  FileText,
  Gauge,
  Hash,
  Headset,
  History,
  Image,
  Link,
  ListChecks,
  Megaphone,
  MessageSquare,
  Package,
  PackagePlus,
  PackageSearch,
  PackageX,
  PenLine,
  Plug,
  RotateCcw,
  ScanSearch,
  Send,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Target,
  TextCursorInput,
  TrendingUp,
  Truck,
  Upload,
  UserCheck,
  UserRound,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { BrandKey } from './brand-marks';
import type { PipeStageId } from './pipe-stages';

/**
 * Agent Org 다이어그램의 좌표 — 위에서 아래로 내려오고, 맡은 에이전트끼리 묶인다.
 *
 *   분석 에이전트    키워드 · SNS · 신상품 · 경쟁사 (모여서 아래로)
 *   소싱 에이전트    소싱 후보 → 1688 · 타오바오 · 알리바바 → 괜찮은 상품 선별
 *   사장님 컨펌      확인 필요 · 사용자 컨펌 ↔ 텔레그램 보고
 *   상품 · 쇼핑몰    상품등록(상세페이지 · 썸네일) → 쇼핑몰 등록 → 쇼핑몰 · 기억
 *   주문 · 재고 · CS 셀피아 ↔ 주문 → 재고 → CS → 고객
 *   마케팅 에이전트  상품 → 릴스 제작 → 블로그 제작 → 광고 마케팅 → 고객 유입
 *
 * 가운데 세로 축에 1688 · 사용자 컨펌 · 쇼핑몰 · 주문이 선다. 쇼핑몰은 그림의 정가운데다.
 * 묶음 틀은 담긴 박스에서 계산하므로 박스를 옮기면 틀이 따라온다(스펙이 겹침을 검사한다).
 * 좌표는 논리 크기(`DIAGRAM_WIDTH` × `DIAGRAM_HEIGHT`) 기준이고 캔버스가 확대 · 이동한다.
 * 선은 모두 가로 · 세로로만 꺾는다.
 */
export const DIAGRAM_WIDTH = 2400;
export const DIAGRAM_HEIGHT = 2140;

/** 박스 위에 붙는 이름표가 차지하는 높이. 박스끼리 겹침 검사에 포함한다. */
export const DIAGRAM_TAB_HEIGHT = 34;

/** 묶음 틀 — 이름표 줄 높이와 옆 · 아래 여백. */
export const DIAGRAM_GROUP_HEAD = 40;
const GROUP_PAD_X = 22;
const GROUP_PAD_BOTTOM = 20;

const BOX_W = 270;
const BOX_H = 200;
const GAP = 60;
const PITCH = BOX_W + GAP;
/** 서로 다른 묶음에 든 이웃 박스 사이. 틀 두 개의 여백과 틀 사이 틈이 들어간다. */
const GROUP_PITCH = BOX_W + 100;

/** 가운데 세로 축의 박스 x. 이 칸의 가운데가 그림의 가운데다. */
const AXIS = DIAGRAM_WIDTH / 2 - BOX_W / 2;
const L1 = AXIS - PITCH;
const R1 = AXIS + PITCH;
/** 분석 층은 박스가 넷이라 축을 가운데에 두고 반 칸씩 비킨다. */
const A0 = DIAGRAM_WIDTH / 2 - (BOX_W * 4 + GAP * 3) / 2;
const A1 = A0 + PITCH;
const A2 = A1 + PITCH;
const A3 = A2 + PITCH;
/** 상품 에이전트는 쇼핑몰 에이전트 왼쪽 옆 묶음이다. */
const PRODUCT_X = L1 - GROUP_PITCH;
/** 주문 → 재고 → CS 는 묶음이 하나씩이다. */
const INVENTORY_X = AXIS + GROUP_PITCH;
const CS_X = INVENTORY_X + GROUP_PITCH;

/** 층의 박스 윗변. 층 사이에는 틀 여백 · 이름표 줄 · 선이 지나갈 길이 들어간다. */
const ROW_PITCH = BOX_H + GROUP_PAD_BOTTOM + 64 + DIAGRAM_GROUP_HEAD + DIAGRAM_TAB_HEIGHT;
const B1 = 16 + DIAGRAM_GROUP_HEAD + DIAGRAM_TAB_HEIGHT;
const B2 = B1 + ROW_PITCH;
const B3 = B2 + ROW_PITCH;
const B4 = B3 + ROW_PITCH;
const B5 = B4 + ROW_PITCH;
/** 마케팅 줄. 상품등록에서 왼쪽 가장자리를 따라 내려온다 — 주문 줄의 왼쪽이 비어 있다. */
const B6 = B5 + ROW_PITCH;
const REELS_X = PRODUCT_X;
const BLOG_X = REELS_X + PITCH;
const ADS_X = BLOG_X + PITCH;

export type DiagramAgentId =
  | 'analysis'
  | 'sourcing'
  | 'owner'
  | 'product'
  | 'marketing'
  | 'mall'
  | 'order'
  | 'inventory'
  | 'cs';

export interface DiagramAgentDef {
  id: DiagramAgentId;
  label: string;
  /** 에이전트 목록에 적는 한 줄 — 맡은 일. */
  summary: string;
  /**
   * 묶음 틀 · 이름표 · 대표 아이콘의 색. 박스 테두리와 칩은 여전히 상태 색을 따른다 —
   * 에이전트 색은 "누구 일인가", 상태 색은 "지금 어떤가"다.
   */
  color: string;
  icon: LucideIcon;
  /** 에이전트 얼굴(`AgentFace`)의 머리색과 모양. */
  face: { color: string; role: string };
}

export const DIAGRAM_AGENTS: readonly DiagramAgentDef[] = [
  { id: 'analysis', label: '분석 에이전트', summary: '키워드 · SNS · 신상품 · 경쟁사', color: '#38bdf8', icon: ChartNoAxesCombined, face: { color: 'cyan', role: 'data_ad' } },
  { id: 'sourcing', label: '소싱 에이전트', summary: '후보 · 1688 · 타오바오 · AI 선별', color: '#facc15', icon: PackageSearch, face: { color: 'amber', role: 'sourcing' } },
  { id: 'owner', label: '사장님 컨펌', summary: '확인 필요 · 최종 선별 · 텔레그램', color: '#a78bfa', icon: UserCheck, face: { color: 'violet', role: 'ceo' } },
  { id: 'product', label: '상품 에이전트', summary: '상품등록 · 상세페이지 · 썸네일', color: '#f472b6', icon: PackagePlus, face: { color: 'pink', role: 'product' } },
  { id: 'marketing', label: '마케팅 에이전트', summary: '릴스 · 블로그 · 광고 마케팅', color: '#fb7185', icon: Megaphone, face: { color: 'rose', role: 'marketing' } },
  { id: 'mall', label: '쇼핑몰 에이전트', summary: '몰 등록 · 몰 연결 · 기억', color: '#fb923c', icon: Store, face: { color: 'orange', role: 'mall' } },
  { id: 'order', label: '주문 에이전트', summary: '주문수집 · 셀피아 전송 · 송장', color: '#2dd4bf', icon: ShoppingCart, face: { color: 'teal', role: 'orders' } },
  { id: 'inventory', label: '재고 에이전트', summary: '셀피아 재고 · 품절 · 매칭', color: '#a3e635', icon: Warehouse, face: { color: 'emerald', role: 'inventory' } },
  { id: 'cs', label: 'CS 에이전트', summary: '리뷰 · 반품 · 문의', color: '#818cf8', icon: Headset, face: { color: 'indigo', role: 'cs' } },
];

export const DIAGRAM_AGENT_BY_ID: ReadonlyMap<DiagramAgentId, DiagramAgentDef> = new Map(
  DIAGRAM_AGENTS.map((agent) => [agent.id, agent]),
);

/** 타일 하나 — 아이콘이나 바깥 서비스 로고 중 하나. */
export type DiagramTile = { caption: string } & ({ icon: LucideIcon; brand?: never } | { brand: BrandKey; icon?: never });

export interface DiagramRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DiagramNodeBase extends DiagramRect {
  /** 이 박스를 맡은 에이전트. 같은 에이전트의 박스가 한 틀에 묶인다. */
  agent: DiagramAgentId;
  /** 박스 위 이름표. */
  label: string;
}

export interface DiagramStageNode extends DiagramNodeBase {
  kind: 'stage';
  id: string;
  /**
   * 이 박스가 담는 단계. 첫 단계가 박스의 이름 · 링크가 되고, 상태는 모든 단계 중 사람이
   * 먼저 봐야 할 것이 앞선다. 상세페이지 · 썸네일은 상품등록 박스 안에 함께 담는다.
   */
  stageIds: readonly [PipeStageId, ...PipeStageId[]];
  primary: DiagramTile;
  tiles: readonly DiagramTile[];
}

export type DiagramExternalId = 'marketplaces' | 'sellpia' | 'telegram';
export type DiagramPanelId = 'oversight' | 'memory';

export interface DiagramExternalNode extends DiagramNodeBase {
  kind: 'external';
  id: DiagramExternalId;
  href: string;
}

export interface DiagramPanelNode extends DiagramNodeBase {
  kind: 'panel';
  id: DiagramPanelId;
  href: string;
}

export type DiagramNode = DiagramStageNode | DiagramExternalNode | DiagramPanelNode;

export interface DiagramAgentGroup extends DiagramAgentDef, DiagramRect {}

export interface DiagramIoLabel {
  id: string;
  lines: readonly string[];
  x: number;
  y: number;
  w: number;
  align: 'left' | 'right';
}

export interface DiagramEdge {
  id: string;
  /** 이 선이 들어가는 단계. 그 단계가 진행 중이면 선에 흐름이 보인다. */
  to: PipeStageId | null;
  points: readonly (readonly [number, number])[];
  /** 끝에 화살표. `false` 면 버스선 조각이다. */
  arrow: boolean;
  /** 양쪽 화살표 — 주고받는 연결. */
  twoWay?: boolean;
  /** 사람이 하는 일 · 느슨한 연결은 점선. */
  dashed?: boolean;
  label?: { text: string; x: number; y: number };
}

const stage = (
  agent: DiagramAgentId,
  stageIds: readonly [PipeStageId, ...PipeStageId[]],
  label: string,
  x: number,
  y: number,
  primary: DiagramTile,
  tiles: readonly DiagramTile[],
): DiagramStageNode => ({ kind: 'stage', id: stageIds[0], agent, stageIds, label, x, y, w: BOX_W, h: BOX_H, primary, tiles });

export const DIAGRAM_NODES: readonly DiagramNode[] = [
  // 분석 에이전트
  stage('analysis', ['keyword'], '키워드 분석', A0, B1, { icon: Hash, caption: '키워드 수집' }, [
    { brand: 'naver', caption: '네이버' },
    { brand: 'coupang', caption: '쿠팡 순위' },
    { brand: 'google', caption: '구글 트렌드' },
  ]),
  stage('analysis', ['sns'], 'SNS 분석', A1, B1, { icon: Share2, caption: 'SNS 트렌드' }, [
    { brand: 'youtubeShorts', caption: '쇼츠' },
    { brand: 'tiktok', caption: '틱톡' },
    { brand: 'taobao', caption: '타오바오 라이브' },
  ]),
  stage('analysis', ['rising'], '신상품 분석', A2, B1, { icon: Sparkles, caption: '급상승 탐지' }, [
    { brand: '1688', caption: '1688 랭킹' },
    { brand: 'coupang', caption: '쿠팡 급상승' },
    { icon: History, caption: '이력' },
  ]),
  stage('analysis', ['competitor'], '경쟁사 분석', A3, B1, { icon: Target, caption: '경쟁 추적' }, [
    { icon: Users, caption: '경쟁 셀러' },
    { brand: 'coupang', caption: '윙 카탈로그' },
    { icon: Crosshair, caption: '상품 추적' },
  ]),
  // 소싱 에이전트
  stage('sourcing', ['candidates'], '소싱 후보 리스트', L1, B2, { icon: ListChecks, caption: '후보 리스트' }, [
    { icon: Star, caption: '추천표' },
    { icon: Package, caption: '수집상품' },
    { icon: Bookmark, caption: '관심 대상' },
  ]),
  stage('sourcing', ['supplier'], '1688 · 타오바오 · 알리바바', AXIS, B2, { icon: ScanSearch, caption: '공급처 찾기' }, [
    { brand: '1688', caption: '1688' },
    { brand: 'taobao', caption: '타오바오' },
    { brand: 'alibaba', caption: '알리바바' },
  ]),
  stage('sourcing', ['shortlist'], '괜찮은 상품 선별', R1, B2, { icon: Brain, caption: 'AI 선별' }, [
    { icon: Calculator, caption: '경제성' },
    { icon: ShieldCheck, caption: 'KC · 인증' },
    { icon: Gauge, caption: '신뢰도' },
  ]),
  // 사장님 컨펌
  { kind: 'panel', id: 'oversight', agent: 'owner', label: '확인 필요', x: L1, y: B3, w: BOX_W, h: BOX_H, href: '/agent-org#pipe-inbox-title' },
  stage('owner', ['gate'], '사용자 컨펌', AXIS, B3, { icon: UserCheck, caption: '최종 선별' }, [
    { brand: 'telegram', caption: '보고' },
    { icon: Check, caption: '승인' },
    { icon: X, caption: '반려' },
  ]),
  { kind: 'external', id: 'telegram', agent: 'owner', label: '텔레그램', x: R1, y: B3, w: BOX_W, h: BOX_H, href: '/sourcing-ai/final-selection' },
  // 상품 에이전트
  stage('product', ['register', 'content'], '상품등록 · 상세페이지 · 썸네일', PRODUCT_X, B4, { icon: PackagePlus, caption: '상품등록' }, [
    { icon: FileText, caption: '상세페이지' },
    { icon: Image, caption: '썸네일' },
    { brand: 'coupang', caption: '쿠팡 WING' },
  ]),
  // 쇼핑몰 에이전트
  stage('mall', ['malls'], '다양한 쇼핑몰 등록', L1, B4, { icon: Send, caption: '몰별 전송' }, [
    { icon: Plug, caption: '어댑터' },
    { icon: TextCursorInput, caption: '폼 채우기' },
    { icon: Upload, caption: '제출' },
  ]),
  { kind: 'external', id: 'marketplaces', agent: 'mall', label: '쇼핑몰', x: AXIS, y: B4, w: BOX_W, h: BOX_H, href: '/mall-home' },
  { kind: 'panel', id: 'memory', agent: 'mall', label: '기억 · 기록', x: R1, y: B4, w: BOX_W, h: BOX_H, href: '/mall-home' },
  // 주문 에이전트
  { kind: 'external', id: 'sellpia', agent: 'order', label: '셀피아', x: L1, y: B5, w: BOX_W, h: BOX_H, href: '/inventory-hub' },
  stage('order', ['orders'], '주문 · 출고 · 송장', AXIS, B5, { icon: ShoppingCart, caption: '주문 흐름' }, [
    { icon: Download, caption: '주문수집' },
    { icon: ArrowRightLeft, caption: '셀피아 전송' },
    { icon: Truck, caption: '송장' },
  ]),
  // 재고 에이전트
  stage('inventory', ['inventory'], '재고관리', INVENTORY_X, B5, { icon: Warehouse, caption: '재고 동기화' }, [
    { icon: Database, caption: '셀피아 재고' },
    { icon: PackageX, caption: '품절' },
    { icon: Link, caption: '매칭' },
  ]),
  // CS 에이전트
  stage('cs', ['cs'], 'CS 처리', CS_X, B5, { icon: UserRound, caption: '고객 응대' }, [
    { brand: 'coupang', caption: '쿠팡 리뷰' },
    { icon: RotateCcw, caption: '반품' },
    { icon: MessageSquare, caption: '문의' },
  ]),
  // 마케팅 에이전트
  stage('marketing', ['reels'], '릴스 제작', REELS_X, B6, { icon: Clapperboard, caption: '숏폼 영상' }, [
    { brand: 'instagram', caption: '인스타 릴스' },
    { brand: 'youtubeShorts', caption: '쇼츠' },
    { brand: 'tiktok', caption: '틱톡' },
  ]),
  stage('marketing', ['blog'], '블로그 제작', BLOG_X, B6, { icon: PenLine, caption: '블로그 글' }, [
    { brand: 'naver', caption: '네이버 블로그' },
    { icon: FileText, caption: '글 초안' },
    { icon: Image, caption: '사진' },
  ]),
  stage('marketing', ['ads'], '광고 마케팅', ADS_X, B6, { icon: Megaphone, caption: '광고 운영' }, [
    { brand: 'coupang', caption: '쿠팡 광고' },
    { icon: Hash, caption: '광고 키워드' },
    { icon: TrendingUp, caption: 'ROAS' },
  ]),
];

/** 에이전트마다 한 틀 — 담긴 박스(이름표 포함)를 감싸는 사각형. */
export const DIAGRAM_AGENT_GROUPS: readonly DiagramAgentGroup[] = DIAGRAM_AGENTS.map((agent) => {
  const members = DIAGRAM_NODES.filter((node) => node.agent === agent.id);
  const left = Math.min(...members.map((node) => node.x));
  const right = Math.max(...members.map((node) => node.x + node.w));
  const top = Math.min(...members.map((node) => node.y)) - DIAGRAM_TAB_HEIGHT - DIAGRAM_GROUP_HEAD;
  const bottom = Math.max(...members.map((node) => node.y + node.h)) + GROUP_PAD_BOTTOM;
  return { ...agent, x: left - GROUP_PAD_X, y: top, w: right - left + GROUP_PAD_X * 2, h: bottom - top };
});

export const DIAGRAM_IO_LABELS: readonly DiagramIoLabel[] = [
  { id: 'in-signals', lines: ['외부 신호', '네이버 · 쿠팡 · SNS'], x: A0 - 250, y: B1 + 72, w: 190, align: 'right' },
  { id: 'out-customers', lines: ['고객', '리뷰 · 반품 · 문의'], x: CS_X + BOX_W + 64, y: B5 + 72, w: 190, align: 'left' },
  { id: 'out-traffic', lines: ['고객 유입', '쇼핑몰 · SNS · 검색'], x: ADS_X + BOX_W + 64, y: B6 + 72, w: 190, align: 'left' },
];

const mid = (y: number) => y + BOX_H / 2;
const right = (x: number) => x + BOX_W;
const bottom = (y: number) => y + BOX_H;
const center = (x: number) => x + BOX_W / 2;
/** 박스로 들어가는 세로선은 이름표를 피해 박스 오른쪽으로 비킨다. */
const clearOfTab = (x: number) => x + 200;
/** 층 사이의 길 — 위 묶음 틀 아래와 아래 묶음 틀 위 사이의 한가운데. */
const lane = (y: number) => bottom(y) + GROUP_PAD_BOTTOM + 32;

export const DIAGRAM_EDGES: readonly DiagramEdge[] = [
  { id: 'in-1', to: 'keyword', arrow: true, points: [[A0 - 44, mid(B1)], [A0, mid(B1)]] },
  { id: '1-2', to: 'sns', arrow: true, points: [[right(A0), mid(B1)], [A1, mid(B1)]] },
  { id: '2-3', to: 'rising', arrow: true, points: [[right(A1), mid(B1)], [A2, mid(B1)]] },
  { id: '3-4', to: 'competitor', arrow: true, points: [[right(A2), mid(B1)], [A3, mid(B1)]] },
  // 분석 넷의 재료가 한 줄로 모여 소싱 후보로 내려간다.
  { id: 'bus-1', to: null, arrow: false, points: [[center(A0), bottom(B1)], [center(A0), lane(B1)]] },
  { id: 'bus-2', to: null, arrow: false, points: [[center(A1), bottom(B1)], [center(A1), lane(B1)]] },
  { id: 'bus-3', to: null, arrow: false, points: [[center(A2), bottom(B1)], [center(A2), lane(B1)]] },
  { id: 'bus-4', to: null, arrow: false, points: [[center(A3), bottom(B1)], [center(A3), lane(B1)]] },
  { id: 'bus', to: null, arrow: false, points: [[center(A0), lane(B1)], [center(A3), lane(B1)]] },
  { id: 'bus-5', to: 'candidates', arrow: true, points: [[clearOfTab(L1), lane(B1)], [clearOfTab(L1), B2]] },
  { id: '5-6', to: 'supplier', arrow: true, points: [[right(L1), mid(B2)], [AXIS, mid(B2)]] },
  { id: '6-7', to: 'shortlist', arrow: true, points: [[right(AXIS), mid(B2)], [R1, mid(B2)]] },
  {
    id: '7-8',
    to: 'gate',
    arrow: true,
    points: [[center(R1), bottom(B2)], [center(R1), lane(B2)], [clearOfTab(AXIS), lane(B2)], [clearOfTab(AXIS), B3]],
  },
  {
    id: 'gate-telegram',
    to: 'gate',
    arrow: true,
    twoWay: true,
    dashed: true,
    points: [[right(AXIS), mid(B3)], [R1, mid(B3)]],
  },
  {
    id: '8-register',
    to: 'register',
    arrow: true,
    points: [[center(AXIS), bottom(B3)], [center(AXIS), lane(B3)], [clearOfTab(PRODUCT_X), lane(B3)], [clearOfTab(PRODUCT_X), B4]],
  },
  { id: 'register-11', to: 'malls', arrow: true, points: [[right(PRODUCT_X), mid(B4)], [L1, mid(B4)]] },
  { id: '11-marketplaces', to: null, arrow: true, twoWay: true, points: [[right(L1), mid(B4)], [AXIS, mid(B4)]] },
  {
    id: 'marketplaces-orders',
    to: 'orders',
    arrow: true,
    points: [[clearOfTab(AXIS), bottom(B4)], [clearOfTab(AXIS), B5]],
    label: { text: '주문', x: clearOfTab(AXIS) + 28, y: lane(B4) + 4 },
  },
  { id: 'sellpia-orders', to: null, arrow: true, twoWay: true, points: [[right(L1), mid(B5)], [AXIS, mid(B5)]] },
  { id: 'orders-12', to: 'inventory', arrow: true, points: [[right(AXIS), mid(B5)], [INVENTORY_X, mid(B5)]] },
  { id: '12-13', to: 'cs', arrow: true, points: [[right(INVENTORY_X), mid(B5)], [CS_X, mid(B5)]] },
  { id: '13-out', to: null, arrow: true, points: [[right(CS_X), mid(B5)], [right(CS_X) + 50, mid(B5)]] },
  {
    id: 'inventory-sellpia',
    to: null,
    arrow: true,
    twoWay: true,
    dashed: true,
    points: [
      [center(INVENTORY_X), bottom(B5)],
      [center(INVENTORY_X), bottom(B5) + 44],
      [center(L1), bottom(B5) + 44],
      [center(L1), bottom(B5)],
    ],
    label: { text: '재고 동기화', x: center(AXIS), y: bottom(B5) + 36 },
  },
  // 등록한 상품이 마케팅으로 — 주문 줄 왼쪽의 빈 가장자리를 따라 내려간다.
  {
    id: 'register-reels',
    to: 'reels',
    arrow: true,
    points: [[clearOfTab(PRODUCT_X), bottom(B4)], [clearOfTab(PRODUCT_X), B6]],
    label: { text: '콘텐츠', x: clearOfTab(PRODUCT_X) - 34, y: lane(B5) + 4 },
  },
  { id: 'reels-blog', to: 'blog', arrow: true, points: [[right(REELS_X), mid(B6)], [BLOG_X, mid(B6)]] },
  { id: 'blog-ads', to: 'ads', arrow: true, points: [[right(BLOG_X), mid(B6)], [ADS_X, mid(B6)]] },
  { id: 'ads-out', to: null, arrow: true, points: [[right(ADS_X), mid(B6)], [right(ADS_X) + 50, mid(B6)]] },
];
