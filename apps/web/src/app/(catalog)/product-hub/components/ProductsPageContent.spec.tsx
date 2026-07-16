import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductsPageContent from './ProductsPageContent';

const state = vi.hoisted(() => ({
  abcGrade: '',
  activeStatus: 'active' as const,
  adStatus: 'all' as const,
  category: '',
  data: {
    items: [{
      id: '11111111-1111-4111-8111-111111111111',
      code: 'KI-001',
      name: '스테이지 상품',
      description: null,
      category: '완구/놀이',
      brand: 'KidItem',
      tags: ['핵심'],
      imageUrls: [],
      abcGrade: 'A',
      profitTag: null,
      adTier: null,
      adBudgetLimit: null,
      healthScore: 82,
      healthUpdatedAt: null,
      isActive: true,
      updatedAt: '2026-07-16T01:00:00.000Z',
      variantSummary: { total: 2, active: 2, configured: 1, warning: 1 },
      inventoryUnits: 17,
      inventoryStatus: 'configuration_required' as const,
      channelCount: 1,
      channelStatus: 'partial' as const,
      traffic: null,
      orderCount: 4,
      salesAmount: 35_000,
      adSpend: null,
      profit: null,
    }],
    total: 126,
    page: 2,
    limit: 50,
  },
  errorMessage: null as string | null,
  goToPage: vi.fn(),
  handleSearch: vi.fn((event: { preventDefault: () => void }) => event.preventDefault()),
  inventoryStatus: 'all' as const,
  isFetching: false,
  isLoading: false,
  isPlaceholderData: false,
  page: 2,
  periodDays: 30 as const,
  refetch: vi.fn(),
  search: '',
  setAbcGrade: vi.fn(),
  setActiveStatus: vi.fn(),
  setAdStatus: vi.fn(),
  setCategory: vi.fn(),
  setInventoryStatus: vi.fn(),
  setPeriodDays: vi.fn(),
  setSearch: vi.fn(),
  totalPages: 3,
}));
const defaultData = state.data;

vi.mock('../hooks/useProductHubPageState', () => ({
  PAGE_SIZE: 50,
  useProductHubPageState: () => state,
}));

vi.mock('./ProductEditorDialog', () => ({
  ProductEditorDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">상품 만들기</div> : null,
}));

describe('<ProductsPageContent>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.data = defaultData;
    state.errorMessage = null;
  });

  it('preserves the staged product operations composition with MasterProduct rows', () => {
    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getByRole('heading', { level: 1, name: '상품 운영 센터' })).toBeInTheDocument();
    expect(screen.getByText('매출 · 광고 · 재고 · 수익성 통합 관리')).toBeInTheDocument();
    expect(screen.getByText('카탈로그 상품 전체')).toBeInTheDocument();
    expect(screen.getByText('현재 페이지 채널 연결')).toBeInTheDocument();
    expect(screen.getByText('현재 페이지 채널 미연결')).toBeInTheDocument();
    expect(screen.getAllByText('A등급').length).toBeGreaterThan(0);
    expect(screen.getAllByText('B등급').length).toBeGreaterThan(0);
    expect(screen.getAllByText('C등급').length).toBeGreaterThan(0);
    expect(screen.getByText('재고관리 · 현재 페이지')).toBeInTheDocument();
    expect(screen.getByText('임박 재고')).toBeInTheDocument();
    expect(screen.getByText('발주 필요')).toBeInTheDocument();
    expect(screen.getByText('손익점검 · 현재 페이지')).toBeInTheDocument();
    expect(screen.getByText('점검 대상')).toBeInTheDocument();
    expect(screen.getByText('적자상품')).toBeInTheDocument();
    expect(screen.getByText('이익률 3%↓')).toBeInTheDocument();
    expect(screen.getByText('핵심상품')).toBeInTheDocument();
    expect(screen.getByText('알림 · 현재 페이지')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전체 카테고리' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '완구/놀이' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '상품' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '재고' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '매출' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '광고비율' })).toBeInTheDocument();
    expect(screen.getByText('스테이지 상품')).toBeInTheDocument();
    expect(screen.getByText(/KI-001/)).toBeInTheDocument();
    expect(screen.getAllByText('구성 필요').length).toBeGreaterThan(0);
    expect(screen.getAllByText('미수집').length).toBeGreaterThan(0);
    const inventoryCard = screen.getByText('재고관리 · 현재 페이지').closest('article');
    expect(inventoryCard).not.toBeNull();
    expect(within(inventoryCard!).getAllByText('미수집').length).toBeGreaterThan(0);
    expect(inventoryCard).not.toHaveTextContent('17');
  });

  it('keeps the staged header and enables period, category, and product creation controls', () => {
    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getByRole('button', { name: '트래픽 업로드' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Sellpia 동기화' })).toHaveAttribute(
      'href',
      '/inventory-hub?tab=sellpia-sync',
    );

    fireEvent.click(screen.getByRole('button', { name: '7일' }));
    expect(state.setPeriodDays).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByRole('button', { name: '완구/놀이' }));
    expect(state.setCategory).toHaveBeenCalledWith('완구/놀이');
    fireEvent.click(screen.getByRole('button', { name: '+ 상품 추가' }));
    expect(screen.getByRole('dialog', { name: '' })).toHaveTextContent('상품 만들기');
  });

  it('labels page-derived operating metrics and only applies the matching inventory filter', () => {
    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getAllByText(/현재 페이지/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /현재 페이지 품절 상품/ }));
    expect(state.setInventoryStatus).toHaveBeenCalledWith('out_of_stock');
    expect(screen.queryByRole('button', { name: /재고위험/ })).not.toBeInTheDocument();
    expect(screen.getByText(/현재 페이지 재고위험/)).toBeInTheDocument();
  });

  it('shows a load error without also claiming a valid empty result', () => {
    state.data = { ...defaultData, items: [], total: 0 };
    state.errorMessage = '상품 목록 실패';

    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getByText('상품 목록 실패')).toBeInTheDocument();
    expect(screen.queryByText('조건에 맞는 KidItem 상품이 없습니다.')).not.toBeInTheDocument();
  });
});
