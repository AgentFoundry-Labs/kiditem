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

const MANY = '11111111-1111-4111-8111-111111111111';
const ONE = '22222222-2222-4222-8222-222222222222';
const FIRST = '33333333-3333-4333-8333-333333333333';
const SECOND = '44444444-4444-4444-8444-444444444444';

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

function checkResult(overrides: Partial<SalesProductMallSheetCheck['products'][number]> = {}): SalesProductMallSheetCheck {
  const many: SalesProductMallSheetCheck['products'][number] = {
    salesProductId: MANY,
    code: 'KID001',
    name: '설정 여러 개',
    rows: 0,
    problems: ['몰별 등록 설정이 여러 개입니다 — 이 엑셀에 쓸 등록 설정을 골라 주세요.'],
    warnings: [],
    unreadableImages: 0,
    categories: [],
    mallTargets: [{
      mallKey: 'teacher-mall',
      selectionRequired: true,
      targets: [
        { id: FIRST, label: '기본 등록', optionCount: 1, categoryPath: null },
        { id: SECOND, label: '별도 등록', optionCount: 2, categoryPath: '완구>블록' },
      ],
    }],
    ...overrides,
  };
  const one: SalesProductMallSheetCheck['products'][number] = {
    salesProductId: ONE,
    code: 'KID002',
    name: '설정 하나',
    rows: 1,
    problems: [],
    warnings: [],
    unreadableImages: 0,
    categories: [],
    mallTargets: [{
      mallKey: 'teacher-mall',
      selectionRequired: false,
      targets: [{ id: FIRST, label: '기본 등록', optionCount: 1, categoryPath: null }],
    }],
  };
  return {
    sheetKey: 'teacherville',
    scope: 'selected',
    missingFixed: [],
    maybeListed: 0,
    ready: many.problems.length ? 1 : 2,
    blocked: many.problems.length ? 1 : 0,
    products: [many, one],
  };
}

function open() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MallSheetDialog onClose={vi.fn()} salesProductIds={[MANY, ONE]} />
    </QueryClientProvider>,
  );
}

describe('<MallSheetDialog /> choosing among several registration settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(salesProductApi.mallSheets).mockResolvedValue(sheets);
    vi.mocked(salesProductApi.pendingPublicImages).mockResolvedValue({ urls: [], products: 0 });
    vi.mocked(salesProductApi.checkMallSheet).mockResolvedValue(checkResult());
    vi.mocked(salesProductApi.downloadMallSheet).mockResolvedValue({ blob: new Blob(['x']), fileName: 'a.xls' });
  });

  it('asks only for the product that has several settings', async () => {
    open();
    const choose = await screen.findByRole('combobox', { name: 'KID001 teacher-mall 등록 설정' });
    expect(screen.queryByRole('combobox', { name: 'KID002 teacher-mall 등록 설정' })).not.toBeInTheDocument();
    expect([...choose.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      '설정 고르기(2개)',
      '기본 등록 · 단품 1개',
      '별도 등록 · 단품 2개 · 완구>블록',
    ]);
    expect(screen.getByText('등록 설정을 고르지 않은 상품 · 몰 1개는 받을 수 없습니다.')).toBeInTheDocument();
  });

  it('still downloads the ready products while another product waits for its setting', async () => {
    open();
    await screen.findByRole('combobox', { name: 'KID001 teacher-mall 등록 설정' });
    // 막힌 상품은 담기지 않는다 — 담은 상품만으로 파일을 만든다.
    expect(screen.getByRole('checkbox', { name: 'KID001 고르기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /엑셀 받기/ })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /엑셀 받기/ }));
    await waitFor(() => expect(salesProductApi.downloadMallSheet).toHaveBeenCalledTimes(1));
    expect(vi.mocked(salesProductApi.downloadMallSheet).mock.calls[0]![1])
      .toEqual({ salesProductIds: [ONE], fixed: {} });
  });

  it('will not download with the earlier check result after the setting changes', async () => {
    open();
    const choose = await screen.findByRole('combobox', { name: 'KID001 teacher-mall 등록 설정' });
    fireEvent.change(choose, { target: { value: SECOND } });

    expect(screen.getByText('등록 설정을 바꿨습니다 — 다시 확인을 눌러 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /엑셀 받기/ })).toBeDisabled();
    expect(salesProductApi.downloadMallSheet).not.toHaveBeenCalled();
  });

  it('re-checks with the chosen setting and then splits the download, sending each batch its own choice', async () => {
    vi.mocked(salesProductApi.checkMallSheet).mockResolvedValueOnce(checkResult());
    open();
    const choose = await screen.findByRole('combobox', { name: 'KID001 teacher-mall 등록 설정' });
    fireEvent.change(choose, { target: { value: SECOND } });

    vi.mocked(salesProductApi.checkMallSheet).mockResolvedValue(checkResult({ problems: [], rows: 3 }));
    fireEvent.click(screen.getByRole('button', { name: /다시 확인/ }));

    await waitFor(() => expect(salesProductApi.checkMallSheet).toHaveBeenLastCalledWith('teacherville', {
      fixed: {},
      salesProductIds: [MANY, ONE],
      targetIds: [{ salesProductId: MANY, mallKey: 'teacher-mall', targetId: SECOND }],
    }));
    await waitFor(() => expect(screen.getByRole('button', { name: /엑셀 받기/ })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: /엑셀 받기/ }));
    // 몰이 한 파일에 하나만 받으므로 묶음마다 따로 보낸다 — 그 묶음에 없는 상품의 선택은 보내지 않는다.
    await waitFor(() => expect(salesProductApi.downloadMallSheet).toHaveBeenCalledTimes(2));
    expect(vi.mocked(salesProductApi.downloadMallSheet).mock.calls.map((call) => call[1])).toEqual([
      { salesProductIds: [MANY], fixed: {}, targetIds: [{ salesProductId: MANY, mallKey: 'teacher-mall', targetId: SECOND }] },
      { salesProductIds: [ONE], fixed: {} },
    ]);
  });
});
