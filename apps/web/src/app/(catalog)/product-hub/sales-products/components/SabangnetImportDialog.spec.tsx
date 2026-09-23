import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { SabangnetImportDialog } from './SabangnetImportDialog';
import type { SabangnetImportPreview } from '@kiditem/shared/sales-product';

const mocks = vi.hoisted(() => ({
  importSabangnet: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/lib/sales-product-api', () => ({
  salesProductApi: { importSabangnet: mocks.importSabangnet },
  salesProductKeys: { all: ['sales-products'] },
}));
vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

const PRODUCT_ONE = '11111111-1111-4111-8111-111111111111';
const PRODUCT_TWO = '22222222-2222-4222-8222-222222222222';

function makePreview(dryRun: boolean): SabangnetImportPreview {
  return {
    dryRun,
    existingChanges: [
      {
        salesProductId: PRODUCT_ONE,
        code: 'KID-101',
        name: '수정할 우산',
        sourceKey: '100101',
        expectedVersion: 4,
        changed: true,
        baselineOnly: false,
        preserved: ['noticeCategory', 'noticeValues', 'certifications', 'kcStatus'],
        updated: ['detailHtml', 'extraDetailHtml'],
      },
      {
        salesProductId: PRODUCT_TWO,
        code: 'KID-102',
        name: '그대로 둘 스티커',
        sourceKey: '100102',
        expectedVersion: 2,
        changed: false,
        baselineOnly: false,
        preserved: [],
        updated: [],
      },
    ],
    files: [{ name: 'products.xlsx', kind: 'products', rows: 2 }],
    products: { total: 2, created: 1, updated: dryRun ? 0 : 1, unchanged: dryRun ? 1 : 0 },
    options: { total: 2, withOptionsProducts: 1, linked: 1, unlinked: 0 },
    channelOverrides: { total: 0, saved: 0, skippedByShop: {} },
    issues: [],
    issueCount: 0,
    links: null,
    mallValues: null,
  };
}

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SabangnetImportDialog onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

async function uploadAndPreview(user: ReturnType<typeof userEvent.setup>, preview = makePreview(true)) {
  const file = new File(['workbook'], 'products.xlsx');
  await user.upload(screen.getByLabelText(/엑셀 파일 고르기/), file);
  mocks.importSabangnet.mockResolvedValueOnce(preview);
  await user.click(screen.getByRole('button', { name: '미리보기' }));
  await waitFor(() => expect(screen.getByText('기존 판매상품 고치기')).toBeInTheDocument());
  return file;
}

describe('<SabangnetImportDialog />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('leaves existing products unchecked and keeps new-product counts on the default apply', async () => {
    const user = userEvent.setup();
    renderDialog();
    const file = await uploadAndPreview(user);

    const first = screen.getByRole('checkbox', { name: '수정할 우산 (KID-101) 기존 상품 고치기' });
    expect(first).not.toBeChecked();
    expect(screen.getByText(/새로 1/)).toBeInTheDocument();

    mocks.importSabangnet.mockResolvedValueOnce(makePreview(false));
    await user.click(screen.getByRole('button', { name: '옮기기' }));

    await waitFor(() => expect(mocks.importSabangnet).toHaveBeenLastCalledWith([file], false, []));
  });

  it('submits selected preview versions and retains the preview after a stale-version error', async () => {
    const user = userEvent.setup();
    renderDialog();
    const file = await uploadAndPreview(user);

    const first = screen.getByRole('checkbox', { name: '수정할 우산 (KID-101) 기존 상품 고치기' });
    await user.click(first);
    expect(first).toBeChecked();
    mocks.importSabangnet.mockRejectedValueOnce(new ApiError(409, 'Conflict', '미리보기 뒤 판매상품이 바뀌었습니다.'));

    await user.click(screen.getByRole('button', { name: '옮기기' }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('미리보기 뒤 판매상품이 바뀌었습니다.'));
    expect(screen.getByText('기존 판매상품 고치기')).toBeInTheDocument();
    expect(first).toBeChecked();
    expect(mocks.importSabangnet).toHaveBeenLastCalledWith([file], false, [{
      salesProductId: PRODUCT_ONE,
      expectedVersion: 4,
    }]);
  });

  it('says which operator edits a reimport keeps and which fields it updates', async () => {
    const user = userEvent.setup();
    renderDialog();
    await uploadAndPreview(user);

    expect(screen.getByText('편집값 유지: 고시·KC · 갱신: 상세')).toBeInTheDocument();
    expect(screen.getAllByText(/편집값 유지|갱신:/)).toHaveLength(1);
  });

  it('says a product whose values stay the same only gets a new baseline', async () => {
    const user = userEvent.setup();
    const preview = makePreview(true);
    preview.existingChanges[1] = { ...preview.existingChanges[1]!, changed: true, baselineOnly: true };
    renderDialog();
    await uploadAndPreview(user, preview);

    expect(screen.getByText(/KID-102 · 원천키 100102 · 버전 2 · 기준값만 갱신/)).toBeInTheDocument();
    expect(screen.getByText(/KID-101 · 원천키 100101 · 버전 4 · 바뀐 내용 있음/)).toBeInTheDocument();
  });
});
