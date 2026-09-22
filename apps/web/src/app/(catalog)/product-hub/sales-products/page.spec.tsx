import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SalesProductsPage from './page';

const navigation = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
const listQuery = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => '/product-hub/sales-products',
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.params,
}));

vi.mock('@/lib/sales-product-api', () => ({
  salesProductKeys: { list: (query: unknown) => ['sales-products', query] },
  salesProductApi: { list: (query: unknown) => listQuery(query) },
}));

vi.mock('./components/ExternalImagesNotice', () => ({ ExternalImagesNotice: () => null }));
vi.mock('./components/MallPriceAdoptionNotice', () => ({ MallPriceAdoptionNotice: () => null }));
vi.mock('./components/SabangnetImportDialog', () => ({ SabangnetImportDialog: () => null }));
vi.mock('@/components/mall-sheet/MallSheetDialog', () => ({ MallSheetDialog: () => null }));

function listItem(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'KID00000001',
    ownCode: null,
    sourceCandidateId: null,
    name: '비눗방울총',
    status: 'active',
    salePrice: 3000,
    imageUrl: null,
    optionAxes: [],
    optionCount: 1,
    sellingOptionCount: 1,
    unlinkedOptionCount: 0,
    channelListingCount: 0,
    channelOverrideCount: 0,
    updatedAt: '2026-09-22T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SalesProductsPage />
    </QueryClientProvider>,
  );
}

describe('판매상품 목록 화면', () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
    navigation.replace.mockClear();
    listQuery.mockReset();
    listQuery.mockResolvedValue({
      items: [listItem()],
      total: 1,
      page: 1,
      limit: 50,
      summary: { total: 4, withOptions: 2, withUnlinkedOptions: 1, unregistered: 3 },
    });
  });

  it('아직 몰에 올리지 않은 상품을 그 수와 함께 따로 볼 수 있다', async () => {
    renderPage();
    await screen.findByText('비눗방울총');
    const summary = within(screen.getByRole('region', { name: '판매상품 요약' }));
    expect(summary.getByText('아직 몰에 없음')).toBeInTheDocument();
    expect(summary.getByText('3개')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '아직 몰에 없음' }));
    expect(navigation.replace).toHaveBeenCalledWith('/product-hub/sales-products?focus=unregistered');
  });

  it('주소의 미등록 조건을 그대로 서버에 묻는다', async () => {
    navigation.params = new URLSearchParams('focus=unregistered');
    renderPage();
    await screen.findByText('비눗방울총');
    expect(listQuery).toHaveBeenCalledWith(expect.objectContaining({ focus: 'unregistered' }));
  });
});
