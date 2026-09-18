import {
  Bot,
  Gauge,
  Workflow,
  BrainCircuit,
  Boxes,
  Building2,
  ClipboardList,
  Compass,
  FileSpreadsheet,
  Flame,
  ImageIcon,
  Layers,
  LayoutDashboard,
  LineChart,
  Link2,
  MessageSquare,
  Package,
  PackageCheck,
  PackagePlus,
  PackageSearch,
  PackageX,
  Plus,
  Rocket,
  Search,
  Settings,
  Share2,
  ShoppingCart,
  Store,
  Sparkles,
  Target,
  TrendingUp,
  Wand2,
  Warehouse,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  gatedReason?: string;
  groupLabel?: string;
}

export interface MenuSection {
  label: string;
  collapsible: boolean;
  items: MenuItem[];
}

export const menuSections: MenuSection[] = [
  {
    label: '',
    collapsible: false,
    items: [
      { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
    ],
  },
  {
    label: '소싱 에이전트',
    collapsible: true,
    items: [
      { href: '/agents/sourcing', label: '에이전트 홈', icon: Gauge },
      { href: '/sourcing-ai', label: '소싱 홈', icon: Compass },
      { href: '/sourcing-ai/market', label: '시장 분석', icon: TrendingUp, groupLabel: '리서치' },
      { href: '/sourcing-ai/keywords', label: '키워드 분석', icon: Search },
      { href: '/sourcing-ai/category-sourcing', label: '카테고리 소싱', icon: Layers },
      { href: '/sourcing-ai/competitor-analysis', label: '경쟁업체 분석', icon: Building2 },
      { href: '/sourcing-ai/wing-catalog', label: '쿠팡 상품 분석', icon: PackageSearch },
      { href: '/sourcing-ai/product-tracking', label: '상품 추적', icon: LineChart },
      { href: '/sourcing-ai/rising-products', label: '급상승 탐지', icon: Flame },
      { href: '/sourcing-ai/recommendations', label: '오늘의 추천', icon: Sparkles },
      { href: '/sourcing-ai/wholesale-search', label: '도매 상품 검색', icon: ShoppingCart, groupLabel: '소싱' },
      { href: '/sourcing-ai/decision-center', label: '의사결정 센터', icon: BrainCircuit },
      { href: '/sourcing-ai/validation', label: '상품 검증', icon: ClipboardList },
      { href: '/sourcing-ai/final-selection', label: '최종 선택', icon: PackageCheck },
      { href: '/sourcing-ai/settings', label: '소싱 설정', icon: Settings, groupLabel: '설정' },
    ],
  },
  {
    label: '상품 에이전트',
    collapsible: true,
    items: [
      { href: '/agents/product', label: '에이전트 홈', icon: Gauge },
      { href: '/product-pipeline/productgenerate', label: '상품 생성', icon: Plus },
      { href: '/product-pipeline/collected-products', label: '수집 상품', icon: Search },
      { href: '/product-pipeline/registered-products', label: '등록 상품', icon: Package },
      { href: '/product-pipeline/detail-template-generation', label: '상세 템플릿 생성', icon: Sparkles },
      { href: '/product-pipeline/thumbnail-ai', label: '썸네일 AI', icon: ImageIcon },
      { href: '/product-pipeline/thumbnail-generation', label: '썸네일 생성', icon: Wand2 },
      { href: '/product-hub', label: '상품 분석', icon: Package },
      { href: '/product-hub/matching', label: '상품 매칭', icon: Link2 },
    ],
  },
  {
    label: '쇼핑몰 에이전트',
    collapsible: true,
    items: [
      { href: '/agents/mall', label: '에이전트 홈', icon: Gauge },
      { href: '/mall-home', label: '쇼핑몰 홈', icon: Target },
      { href: '/mall-channels', label: '쇼핑몰 현황', icon: Share2 },
      { href: '/mall-settings', label: '쇼핑몰 계정', icon: Store },
      { href: '/mall-listings', label: '상품 등록', icon: PackagePlus },
      { href: '/mall-availability', label: '품절 관리', icon: PackageX },
      { href: '/mall-tasks', label: '송신 내역', icon: ClipboardList },
      { href: '/order-collection', label: '주문수집', icon: FileSpreadsheet },
      { href: '/rocket-orders', label: '쿠팡 로켓', icon: Rocket },
      { href: '/coupang-shipments', label: '쿠팡 쉽먼트', icon: PackageCheck },
    ],
  },
  {
    label: '재고관리 에이전트',
    collapsible: true,
    items: [
      { href: '/agents/inventory', label: '에이전트 홈', icon: Gauge },
      { href: '/inventory-hub', label: '재고 관리', icon: Warehouse },
      { href: '/stock-ops', label: '재고 분석', icon: Boxes },
    ],
  },
  {
    label: '마케팅 에이전트',
    collapsible: true,
    items: [
      { href: '/agents/marketing', label: '에이전트 홈', icon: Gauge },
      { href: '/ad-ops', label: '광고전략 AI', icon: Zap },
      { href: '/rank-tracking', label: '쿠팡 순위추적', icon: LineChart },
    ],
  },
  {
    label: 'CS 에이전트',
    collapsible: true,
    items: [
      { href: '/agents/cs', label: '에이전트 홈', icon: Gauge },
      { href: '/reviews', label: '리뷰 관리', icon: MessageSquare },
    ],
  },
  {
    label: '재무분석 에이전트',
    collapsible: true,
    items: [
      { href: '/agents/finance', label: '에이전트 홈', icon: Gauge },
      { href: '/profit-loss', label: '손익 분석', icon: TrendingUp },
      { href: '/sales-analysis', label: '매출 분석', icon: LineChart },
    ],
  },
  {
    label: '',
    collapsible: false,
    items: [
      { href: '/agent-org', label: 'Agent Org', icon: Workflow },
      { href: '/agent-os', label: 'Agent OS', icon: Bot },
      { href: '/settings', label: '설정', icon: Settings },
    ],
  },
];
