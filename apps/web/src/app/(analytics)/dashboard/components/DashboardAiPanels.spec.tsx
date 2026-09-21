import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClipboardX, Headset, PackageX, TrendingDown } from 'lucide-react';
import { DashboardAiIssues, type DashboardIssue } from './DashboardAiIssues';
import { DashboardAiSuggestion } from './DashboardAiSuggestion';
import { buildAiSuggestions, type AiSuggestionInput } from '../lib/ai-suggestions';
import { DashboardRecentProducts } from './DashboardRecentProducts';
import type { DashboardReorderSuggestion } from '@kiditem/shared/dashboard';
import type { MallListingMatrixRow } from '@kiditem/shared/mall-publishing';

const issues: DashboardIssue[] = [
  { key: 'stock', label: '재고 부족', icon: PackageX, tone: 'red', count: 78, description: '곧 품절될 상품이 있어요', action: { label: '바로 확인하기', href: '/product-hub?inventoryFocus=reorder' } },
  { key: 'salesDecline', label: '매출 하락', icon: TrendingDown, tone: 'orange', count: 0, description: '줄어든 상품이 없어요', action: { label: '분석하기', href: '/stock-ops?tab=product-outflow' } },
  { key: 'cs', label: 'CS 미응답', icon: Headset, tone: 'sky', count: null, description: '고객 문의 수집이 아직 연결되지 않았어요', action: { label: 'CS 에이전트', href: '/agents/cs' } },
  { key: 'registration', label: '상품 등록 실패', icon: ClipboardX, tone: 'violet', count: 12, description: '쿠팡에서 등록이 반려됐어요', action: { label: '확인하기', href: '/mall-listings' } },
];

function suggestion(overrides: Partial<DashboardReorderSuggestion> = {}): DashboardReorderSuggestion {
  return {
    productCode: '3189',
    name: '세계지도 만국기',
    optionName: null,
    masterProductId: '11111111-1111-4111-8111-111111111111',
    imageUrl: null,
    availableStock: 58,
    monthlyOutflow: 1_064,
    daysLeft: 3,
    reorderPoint: 1_596,
    ...overrides,
  };
}

function matrixRow(overrides: Partial<MallListingMatrixRow> = {}): MallListingMatrixRow {
  return {
    masterProductId: '22222222-2222-4222-8222-222222222222',
    name: '3500LED글라이더',
    code: 'INV-SELLPIA-1',
    sellpiaCode: '10497-1',
    imageUrl: null,
    category: null,
    stock: 440,
    publishedCount: 0,
    cells: [],
    updatedAt: '2026-09-17T14:28:29.148Z',
    ...overrides,
  };
}

describe('DashboardAiIssues', () => {
  it('shows each area with its count, links to the screen that handles it, and keeps an unknown count unknown', () => {
    render(<DashboardAiIssues issues={issues} basis={[]} />);

    const stock = screen.getByTestId('dashboard-issue-stock');
    expect(stock).toHaveTextContent('78개');
    expect(within(stock).getByRole('link', { name: /바로 확인하기/ })).toHaveAttribute('href', '/product-hub?inventoryFocus=reorder');

    const cs = screen.getByTestId('dashboard-issue-cs');
    expect(cs).toHaveTextContent('—');
    expect(cs).not.toHaveTextContent('0개');
    expect(screen.getByTestId('dashboard-issue-salesDecline')).toHaveTextContent('0개');
  });

  it('adds up only the areas it could count', () => {
    render(<DashboardAiIssues issues={issues} basis={[]} />);
    // 78 + 0 + 12 — CS 미응답은 모름이라 더하지 않는다.
    expect(screen.getByText('90개 항목')).toBeInTheDocument();
  });
});

describe('DashboardAiSuggestion', () => {
  // 제안 줄은 `lib/ai-suggestions` 가 만든다. 이 칸은 두 장씩 넘겨 보여 주기만 한다
  // (사장님 2026-09-20).
  const built = (overrides: Partial<AiSuggestionInput> = {}) => buildAiSuggestions({
    findings: { reorderSuggestions: [suggestion()], salesDecline: null, registrationFailures: null } as never,
    stock: undefined,
    unlinkedProducts: null,
    ...overrides,
  });

  it('가장 급한 발주를 상품 화면으로 이어 준다', () => {
    render(<DashboardAiSuggestion suggestions={built()} isLoading={false} isError={false} />);

    const card = screen.getByTestId('dashboard-ai-suggestion-reorder:3189');
    expect(card).toHaveAttribute('href', '/product-hub/11111111-1111-4111-8111-111111111111');
    expect(card).toHaveTextContent('세계지도 만국기의 재고가 3일 후 소진됩니다');
    expect(card).toHaveTextContent('현재고 58개 · 월 평균 1,064개 판매');
  });

  it('제안이 넷을 넘으면 두 장씩 넘겨 본다', () => {
    const many = buildAiSuggestions({
      findings: {
        reorderSuggestions: [suggestion(), suggestion({ productCode: '2', name: '투톤슬라임', masterProductId: null, daysLeft: 0 })],
        salesDecline: { month: '2026-08', keyProductLimit: 30, count: 23, items: [] },
        registrationFailures: { count: 12, byChannel: [] },
      } as never,
      stock: { outOfStockCount: 879, reorderProductCount: 58 },
      unlinkedProducts: 2_429,
    });
    render(<DashboardAiSuggestion suggestions={many} isLoading={false} isError={false} />);

    // 한 장에 둘. 다음 장으로 넘기면 다른 제안이 선다.
    expect(screen.getByTestId('dashboard-ai-suggestion-reorder:3189')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-ai-suggestion-unlinked')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다음 제안' }));
    expect(screen.getByTestId('dashboard-ai-suggestion-unlinked')).toHaveTextContent('2,429개가 아직 어느 몰에도 없습니다');
  });

  it('제안이 없을 때와 못 읽었을 때를 가른다', () => {
    const { rerender } = render(<DashboardAiSuggestion suggestions={[]} isLoading={false} isError={false} />);
    expect(screen.getByText('지금 서둘러 할 일이 없습니다.')).toBeInTheDocument();

    rerender(<DashboardAiSuggestion suggestions={[]} isLoading={false} isError />);
    expect(screen.getByText('제안을 읽지 못했습니다.')).toBeInTheDocument();
  });
});

describe('DashboardRecentProducts', () => {
  it('lists the newest products with how many malls sell them, in six fixed slots', () => {
    const { container } = render(
      <DashboardRecentProducts
        rows={[matrixRow(), matrixRow({ masterProductId: '33333333-3333-4333-8333-333333333333', name: '700할로윈캔디', sellpiaCode: '10484-1', publishedCount: 6 })]}
        isLoading={false}
        isError={false}
      />,
    );

    expect(screen.getByRole('link', { name: /3500LED글라이더/ })).toHaveAttribute('href', '/product-hub/22222222-2222-4222-8222-222222222222');
    expect(screen.getByText('몰 등록 전')).toBeInTheDocument();
    expect(screen.getByText('6개 몰 판매 중')).toBeInTheDocument();
    expect(screen.getByText('셀피아 10497-1 · 재고 440개')).toBeInTheDocument();
    expect(container.querySelectorAll('ul > li')).toHaveLength(6);
  });

  it('names a failed read instead of showing empty slots', () => {
    render(<DashboardRecentProducts rows={undefined} isLoading={false} isError />);
    expect(screen.getByText('최근 등록 상품을 읽지 못했습니다.')).toBeInTheDocument();
  });
});
