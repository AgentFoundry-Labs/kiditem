import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/lib/api', () => ({
  API_BASE: 'http://localhost:4000',
}));

vi.mock('@/store/useStore', () => ({
  useStore: () => ({
    sidebarOpen: true,
    toggleSidebar: vi.fn(),
    setSidebarOpen: vi.fn(),
  }),
}));

import Sidebar from '@/components/layout/Sidebar';

const EXPECTED_SECTIONS = [
  '상품 파이프라인',
  '상품관리',
  '주문관리',
  '재고관리',
  '출고/반품',
  '거래처',
  '광고관리',
  '재무/분석',
];

const EXPECTED_NAV_ITEMS: { label: string; href: string }[] = [
  { label: '대시보드', href: '/' },
  { label: '소싱/수집', href: '/sourcing' },
  { label: '콘텐츠 생성', href: '/generate' },
  { label: '상품 관리', href: '/product-hub' },
  { label: '리뷰 관리', href: '/reviews' },
  { label: '옵션 마스터', href: '/option-masters' },
  { label: '온톨로지', href: '/ontology' },
  { label: '주문 처리', href: '/order-hub' },
  { label: 'CS 관리', href: '/cs-management' },
  { label: '주문 현황', href: '/order-status-hub' },
  { label: '미배송 조회', href: '/unshipped-items' },
  { label: '재고 관리', href: '/inventory-hub' },
  { label: '재고 분석', href: '/stock-ops' },
  { label: '창고 관리', href: '/warehouses' },
  { label: '출고 현황', href: '/outbound' },
  { label: '반품 관리', href: '/returns' },
  { label: '반품 스캔', href: '/return-scan' },
  { label: '거래처 관리', href: '/supplier-hub' },
  { label: '거래처 목록', href: '/suppliers' },
  { label: '광고 대시보드', href: '/ads' },
  { label: '캠페인 분석', href: '/ads/campaigns' },
  { label: 'ABC 전략', href: '/ads/strategy' },
  { label: '업계 벤치마크', href: '/ads/benchmark' },
  { label: '데이터 수집', href: '/ads/collect' },
  { label: '손익 분석', href: '/profit-loss' },
  { label: '매출 분석', href: '/sales-analysis' },
  { label: '정산 관리', href: '/finance-hub' },
  { label: 'Agent OS', href: '/agents' },
  { label: '설정', href: '/settings' },
];

describe('Sidebar', () => {
  it('renders all 8 section titles', () => {
    render(<Sidebar />);
    for (const section of EXPECTED_SECTIONS) {
      expect(screen.getByText(section)).toBeInTheDocument();
    }
  });

  it('renders all nav items with correct labels', () => {
    render(<Sidebar />);
    for (const item of EXPECTED_NAV_ITEMS) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });

  it('renders nav items with correct hrefs', () => {
    render(<Sidebar />);
    for (const item of EXPECTED_NAV_ITEMS) {
      const link = screen.getByText(item.label).closest('a');
      expect(link).toHaveAttribute('href', item.href);
    }
  });

  it('highlights the active route (dashboard at /)', () => {
    render(<Sidebar />);
    const dashboardLink = screen.getByText('대시보드').closest('a');
    expect(dashboardLink?.className).toContain('bg-violet-50');
    expect(dashboardLink?.className).toContain('text-gray-900');
  });

  it('does not highlight inactive routes', () => {
    render(<Sidebar />);
    const settingsLink = screen.getByText('설정').closest('a');
    expect(settingsLink?.className).not.toContain('bg-violet-50');
    expect(settingsLink?.className).toContain('text-gray-500');
  });

  it('shows Kiditem branding', () => {
    render(<Sidebar />);
    expect(screen.getByText('Kiditem')).toBeInTheDocument();
  });

  it('shows system status when sidebar is open', () => {
    render(<Sidebar />);
    expect(screen.getByText('SYSTEM ONLINE')).toBeInTheDocument();
  });

  it('has correct number of navigation links', () => {
    render(<Sidebar />);
    const links = screen.getAllByRole('link');
    // 29 nav items + 1 brand logo link
    expect(links.length).toBe(EXPECTED_NAV_ITEMS.length + 1);
  });
});
