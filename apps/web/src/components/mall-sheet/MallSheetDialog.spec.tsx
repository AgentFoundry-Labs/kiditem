import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesProductMallSheetCheck, SalesProductMallSheetList } from '@kiditem/shared/sales-product';
import { salesProductApi } from '@/lib/sales-product-api';
import { MallSheetDialog } from './MallSheetDialog';

vi.mock('@/lib/sales-product-api', () => ({
  salesProductKeys: {
    all: ['sales-products'],
    mallSheets: () => ['sales-products', 'mall-sheets'],
    mallCategories: (mallKey: string) => ['sales-products', 'mall-categories', mallKey],
    mallSheetCategories: (sheetKey: string, mallKey: string, query: string) =>
      ['sales-products', 'mall-sheet-categories', sheetKey, mallKey, query],
    publicImages: (ids: readonly string[]) => ['sales-products', 'public-images', [...ids].sort()],
  },
  salesProductApi: {
    mallSheets: vi.fn(),
    checkMallSheet: vi.fn(),
    downloadMallSheet: vi.fn(),
    assignMallCategory: vi.fn(),
    pendingPublicImages: vi.fn(),
    mallCategories: vi.fn(),
    searchMallSheetCategories: vi.fn(),
    savePublicImages: vi.fn(),
  },
}));

vi.mock('@/lib/browser-download', () => ({ downloadBlob: vi.fn() }));

const READY = '11111111-1111-4111-8111-111111111111';
const BLOCKED = '22222222-2222-4222-8222-222222222222';

const sheets: SalesProductMallSheetList = {
  sheets: [{
    sheetKey: 'teacherville',
    label: '티쳐몰',
    mallKeys: ['teacher-mall'],
    categoryBy: 'code',
    maxProducts: 1,
    fixedFields: [],
    notes: [],
  }],
  unavailable: [],
};

function checkResult(): SalesProductMallSheetCheck {
  return {
    sheetKey: 'teacherville',
    scope: 'selected',
    missingFixed: [],
    maybeListed: 0,
    ready: 1,
    blocked: 1,
    products: [
      {
        salesProductId: READY,
        code: 'KID001',
        name: '넣을 수 있는 상품',
        rows: 1,
        problems: [],
        warnings: [],
        unreadableImages: 0,
        categories: [],
      },
      {
        salesProductId: BLOCKED,
        code: null,
        name: '막힌 상품',
        rows: 0,
        problems: ['G마켓 카테고리 번호를 모릅니다.'],
        warnings: [],
        unreadableImages: 0,
        categories: [{
          mallKey: 'teacher-mall',
          path: null,
          code: null,
          source: 'none',
          resolved: false,
          suggestion: { path: '완구>블록', share: 0.8, voters: 2, basis: 'other_malls', resolves: true },
        }],
      },
    ],
  };
}

function open() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MallSheetDialog onClose={vi.fn()} salesProductIds={[READY, BLOCKED]} />
    </QueryClientProvider>,
  );
}

// 판매상품 × 채널계정은 등록 설정이 늘 0/1개다(ADR-0022) — 이 창은 더 이상 고를 설정을 묻지 않는다.
describe('<MallSheetDialog />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salesProductApi.mallSheets).mockResolvedValue(sheets);
    vi.mocked(salesProductApi.pendingPublicImages).mockResolvedValue({ urls: [], products: 0 });
    vi.mocked(salesProductApi.checkMallSheet).mockResolvedValue(checkResult());
    vi.mocked(salesProductApi.downloadMallSheet).mockResolvedValue({ blob: new Blob(['x']), fileName: 'a.xls' });
  });

  it('never shows a registration-setting picker for any product', async () => {
    open();
    await screen.findByText('KID001');
    expect(screen.queryByText('등록 설정')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /등록 설정/ })).not.toBeInTheDocument();
  });

  it('downloads only the ready, selected products with no target-selection payload', async () => {
    open();
    await screen.findByText('KID001');
    expect(screen.getByRole('checkbox', { name: 'KID001 고르기' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'null 고르기' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /엑셀 받기/ }));
    await waitFor(() => expect(salesProductApi.downloadMallSheet).toHaveBeenCalledTimes(1));
    expect(vi.mocked(salesProductApi.downloadMallSheet).mock.calls[0]![1]).toEqual({ salesProductIds: [READY], fixed: {} });
  });

  it('saves a suggested category without any target id', async () => {
    vi.mocked(salesProductApi.assignMallCategory).mockResolvedValue({ written: 1, code: null });
    open();
    await screen.findByText('KID001');
    fireEvent.click(await screen.findByRole('button', { name: /이 1개에 저장/ }));
    await waitFor(() => expect(salesProductApi.assignMallCategory).toHaveBeenCalledWith({
      mallKey: 'teacher-mall',
      path: '완구>블록',
      salesProductIds: [BLOCKED],
    }));
  });
});
