import {
  AlertTriangle,
  Bot,
  Boxes,
  Building2,
  ClipboardList,
  Compass,
  FileSpreadsheet,
  Flame,
  Handshake,
  Headphones,
  ImageIcon,
  Layers,
  LayoutDashboard,
  LineChart,
  Link2,
  MessageSquare,
  Package,
  PackageCheck,
  PackageSearch,
  Plus,
  Rocket,
  RotateCcw,
  ScanLine,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
  Wallet,
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
      { href: '/action-board', label: '액션 보드', icon: ClipboardList },
    ],
  },
  {
    label: '소싱 에이전트',
    collapsible: true,
    items: [
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
      { href: '/sourcing-ai/validation', label: '상품 검증', icon: ClipboardList },
      { href: '/sourcing-ai/final-selection', label: '최종 선택', icon: PackageCheck },
      { href: '/sourcing-ai/settings', label: '소싱 설정', icon: Settings, groupLabel: '설정' },
    ],
  },
  {
    label: '상품 에이전트',
    collapsible: true,
    items: [
      { href: '/product-pipeline/productgenerate', label: '상품 생성', icon: Plus },
      { href: '/product-pipeline/collected-products', label: '수집 상품', icon: Search },
      { href: '/product-pipeline/registered-products', label: '등록 상품', icon: Package },
      { href: '/product-pipeline/detail-template-generation', label: '상세 템플릿 생성', icon: Sparkles },
      { href: '/product-pipeline/thumbnail-ai', label: '썸네일 AI', icon: ImageIcon },
      { href: '/product-pipeline/thumbnail-generation', label: '썸네일 생성', icon: Wand2 },
    ],
  },
  {
    label: '마케팅 에이전트',
    collapsible: true,
    items: [
      { href: '/ad-ops', label: '광고전략 AI', icon: Zap },
      { href: '/rank-tracking', label: '쿠팡 순위추적', icon: LineChart },
    ],
  },
  {
    label: '상품 관리',
    collapsible: true,
    items: [
      { href: '/product-hub', label: '상품 관리', icon: Package },
      { href: '/product-hub/matching', label: '상품 매칭', icon: Link2 },
      { href: '/reviews', label: '리뷰 관리', icon: MessageSquare },
      { href: '/product-hub/options', label: '셀피아 재고', icon: Layers },
    ],
  },
  {
    label: '주문관리',
    collapsible: true,
    items: [
      { href: '/order-hub', label: '주문 처리', icon: ShoppingCart },
      { href: '/order-collection', label: '주문수집', icon: FileSpreadsheet },
      { href: '/rocket-orders', label: '쿠팡 로켓', icon: Rocket },
      { href: '/cs-management', label: 'CS 관리', icon: Headphones },
      { href: '/order-status-hub', label: '주문 현황', icon: ClipboardList },
      { href: '/unshipped-items', label: '미배송 조회', icon: AlertTriangle },
    ],
  },
  {
    label: '재고관리',
    collapsible: true,
    items: [
      { href: '/inventory-hub', label: '재고 관리', icon: Warehouse },
      { href: '/stock-ops', label: '재고 분석', icon: Boxes },
      { href: '/warehouses', label: '창고 관리', icon: Building2 },
    ],
  },
  {
    label: '출고반품',
    collapsible: true,
    items: [
      { href: '/outbound', label: '출고 현황', icon: Truck },
      { href: '/coupang-shipments', label: '쿠팡 쉽먼트', icon: PackageCheck },
      { href: '/returns', label: '반품 관리', icon: RotateCcw },
      { href: '/return-scan', label: '반품 스캔', icon: ScanLine },
    ],
  },
  {
    label: '거래처',
    collapsible: true,
    items: [
      { href: '/supplier-hub', label: '거래처 관리', icon: Handshake },
      { href: '/suppliers', label: '거래처 목록', icon: Users },
    ],
  },
  {
    label: '재무분석',
    collapsible: true,
    items: [
      { href: '/profit-loss', label: '손익 분석', icon: TrendingUp },
      { href: '/sales-analysis', label: '매출 분석', icon: LineChart },
      { href: '/finance-hub', label: '정산 관리', icon: Wallet },
    ],
  },
  {
    label: '',
    collapsible: false,
    items: [
      { href: '/agent-os', label: 'Agent OS', icon: Bot },
      { href: '/settings', label: '설정', icon: Settings },
    ],
  },
];
