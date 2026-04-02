import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  }),
}));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ pendingAccept: 0, pendingReturns: 0 }),
  }) as unknown as typeof fetch;
});

import Sidebar from '@/components/layout/Sidebar';

const EXPECTED_SECTIONS = [
  '상품 파이프라인',
  '주문·물류',
  '광고 관리',
  '분석',
  '에이전트',
];

const EXPECTED_NAV_ITEMS: { label: string; href: string }[] = [
  { label: '대시보드', href: '/' },
  { label: '소싱/수집', href: '/sourcing' },
  { label: '콘텐츠 생성', href: '/generate' },
  { label: '상품 관리', href: '/products' },
  { label: '썸네일 AI', href: '/thumbnails' },
  { label: '주문 조회', href: '/orders' },
  { label: 'CS 관리', href: '/cs-management' },
  { label: '미배송 조회', href: '/unshipped-items' },
  { label: '발주 관리', href: '/purchase-orders' },
  { label: '반품 관리', href: '/returns' },
  { label: '재고 현황', href: '/inventory' },
  { label: '리뷰 관리', href: '/reviews' },
  { label: '광고 대시보드', href: '/ads' },
  { label: '캠페인 분석', href: '/ads/campaigns' },
  { label: 'ABC 전략', href: '/ads/strategy' },
  { label: '업계 벤치마크', href: '/ads/benchmark' },
  { label: '데이터 수집', href: '/ads/collect' },
  { label: '손익 분석', href: '/profit-loss' },
  { label: '통합매출분석', href: '/sales-analysis' },
  { label: '리포트', href: '/reports' },
  { label: '에이전트 관리', href: '/agents' },
  { label: '워크플로우', href: '/workflows' },
  { label: '마켓플레이스', href: '/marketplace' },
  { label: '활동 로그', href: '/agents/activity' },
  { label: '비용 분석', href: '/agents/costs' },
  { label: '스킬 카탈로그', href: '/agents/skills' },
  { label: '설정', href: '/settings' },
];

describe('Sidebar', () => {
  it('renders all 5 section titles', () => {
    render(<Sidebar />);
    for (const section of EXPECTED_SECTIONS) {
      expect(screen.getByText(section)).toBeInTheDocument();
    }
  });

  it('renders all 23 nav items with correct labels', () => {
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
    expect(dashboardLink?.className).toContain('bg-blue-50');
    expect(dashboardLink?.className).toContain('text-blue-600');
  });

  it('does not highlight inactive routes', () => {
    render(<Sidebar />);
    const settingsLink = screen.getByText('설정').closest('a');
    expect(settingsLink?.className).not.toContain('bg-blue-50');
    expect(settingsLink?.className).toContain('text-gray-500');
  });

  it('shows KidItem branding', () => {
    render(<Sidebar />);
    expect(screen.getByText('KidItem')).toBeInTheDocument();
  });

  it('shows system status when sidebar is open', () => {
    render(<Sidebar />);
    expect(screen.getByText('시스템 정상 운영중')).toBeInTheDocument();
  });

  it('has exactly 23 navigation links', () => {
    render(<Sidebar />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(EXPECTED_NAV_ITEMS.length);
  });
});
