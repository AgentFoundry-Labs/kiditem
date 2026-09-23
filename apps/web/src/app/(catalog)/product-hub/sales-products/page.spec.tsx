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
    sourceRecordId: null,
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
    registrationAccounts: [],
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
      summary: { total: 4, withOptions: 2, withUnlinkedOptions: 1, unregistered: 3, draft: 1 },
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

  // KID-310: 되돌리기(demote)는 사라졌다 — archived 는 단순 보관 표식이다.
  it('보관한 상품 줄은 보관으로 읽는다', async () => {
    listQuery.mockResolvedValue({
      items: [listItem({ status: 'archived', sourceRecordId: '22222222-2222-4222-8222-222222222222' })],
      total: 1,
      page: 1,
      limit: 50,
      summary: { total: 1, withOptions: 0, withUnlinkedOptions: 0, unregistered: 0, draft: 0 },
    });
    renderPage();
    expect(await screen.findByText('보관')).toBeInTheDocument();
  });

  // KID-310: 판매 옵션 중 하나라도 가격이 없으면 초안이다 — 코드는 아직 없다(미발급).
  it('아직 KID 를 발급받지 않은 초안 줄은 코드가 미발급으로 보인다', async () => {
    listQuery.mockResolvedValue({
      items: [listItem({ status: 'draft', code: null, salePrice: null })],
      total: 1,
      page: 1,
      limit: 50,
      summary: { total: 1, withOptions: 0, withUnlinkedOptions: 0, unregistered: 1, draft: 1 },
    });
    renderPage();
    expect(await screen.findByText('미발급')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '초안(미발급)' })).toBeInTheDocument();
  });

  it('몰 등록 칸은 등록 상태 reader 의 계정별 상태를 한 배지로 줄이고, 계정별 줄은 배지에 올리면 보인다', async () => {
    const account = (name: string, state: string, changedSinceRegistration = false) => ({
      channelAccountId: '00000000-0000-4000-8000-000000000001',
      channel: 'mall-a',
      channelAccountName: name,
      registrationTargetId: null,
      channelListingId: null,
      externalListingId: null,
      state,
      soldOut: false,
      changedSinceRegistration,
      selectedThumbnailAssetId: null,
      selectedDetailPageRevisionId: null,
      lastExecution: null,
    });
    listQuery.mockResolvedValue({
      items: [listItem({
        channelOverrideCount: 3,
        registrationAccounts: [account('몰 A', 'registered', true), account('몰 B', 'registered'), account('몰 C', 'failed')],
      })],
      total: 1,
      page: 1,
      limit: 50,
      summary: { total: 1, withOptions: 0, withUnlinkedOptions: 0, unregistered: 0, draft: 0 },
    });
    renderPage();

    const badge = await screen.findByText('실패 · 2몰 등록 · 1 변경됨');
    expect(badge).toHaveAttribute('title', '몰 A: 등록됨 · 변경됨 · 재전송 필요\n몰 B: 등록됨\n몰 C: 실패');
    expect(screen.queryByText('3몰')).toBeNull();
  });

  it('주소의 미등록 조건을 그대로 서버에 묻는다', async () => {
    navigation.params = new URLSearchParams('focus=unregistered');
    renderPage();
    await screen.findByText('비눗방울총');
    expect(listQuery).toHaveBeenCalledWith(expect.objectContaining({ focus: 'unregistered' }));
  });
});
