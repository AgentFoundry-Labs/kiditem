import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SellpiaSync from './SellpiaSync';
import type {
  SellpiaSnapshotImportResponse,
  SellpiaStockSnapshotItem,
} from '@kiditem/shared/inventory';

const importSellpiaInventoryFile = vi.hoisted(() => vi.fn(async () => ({
  snapshot: {
    id: '00000000-0000-4000-8000-000000000001',
    fileName: 'exported-list.xlsx',
    rowCount: 1,
    effectiveExportedAt: '2026-06-29T00:00:00.000Z',
    status: 'previewed',
  },
  summary: {
    matchedCount: 1,
    reviewCount: 1,
    rejectedCount: 0,
    newProductCandidateCount: 0,
  },
  items: [],
  newProductCandidates: [],
})));
const approveSellpiaSnapshotItem = vi.hoisted(() => vi.fn(async () => undefined));
const ignoreSellpiaItem = vi.hoisted(() => vi.fn(async () => undefined));
const approveSellpiaSnapshotItems = vi.hoisted(() => vi.fn());
const ignoreSellpiaSnapshotItems = vi.hoisted(() => vi.fn());
const resolveSellpiaCandidate = vi.hoisted(() => vi.fn(async () => ({
  id: '00000000-0000-4000-8000-000000000011',
  snapshotItemId: '00000000-0000-4000-8000-000000000012',
  sellpiaProductCode: 'SP-NEW',
  sellpiaProductName: '신규 상품',
  sellpiaStock: 3,
  safetyStock: 0,
  barcode: null,
  status: 'created_new_option',
  operatorInitialStock: 3,
})));

vi.mock('../../_shared/inventory-api', () => ({
  importSellpiaInventoryFile,
  approveSellpiaSnapshotItem,
  ignoreSellpiaItem,
  approveSellpiaSnapshotItems,
  ignoreSellpiaSnapshotItems,
  resolveSellpiaCandidate,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function buildImportResponse(patch: Partial<SellpiaSnapshotImportResponse>): SellpiaSnapshotImportResponse {
  return {
    snapshot: {
      id: '00000000-0000-4000-8000-000000000001',
      fileName: 'exported-list.xlsx',
      rowCount: patch.items?.length ?? 0,
      effectiveExportedAt: '2026-06-29T00:00:00.000Z',
      status: 'previewed',
    },
    summary: {
      matchedCount: 0,
      reviewCount: 0,
      rejectedCount: 0,
      newProductCandidateCount: 0,
      ...patch.summary,
    },
    items: patch.items ?? [],
    newProductCandidates: patch.newProductCandidates ?? [],
  };
}

function buildSnapshotItem(patch: Partial<SellpiaStockSnapshotItem>): SellpiaStockSnapshotItem {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    rowNumber: 2,
    sellpiaProductCode: 'SP-001',
    sellpiaProductName: '상품',
    sellpiaStock: 10,
    safetyStock: 0,
    barcode: null,
    productOptionId: '00000000-0000-4000-8000-000000000011',
    inventoryId: '00000000-0000-4000-8000-000000000012',
    rocketLedgerNet: 0,
    targetCurrentStock: 10,
    kiditemStockBefore: 8,
    diff: 2,
    diffRate: 0.2,
    status: 'needs_review',
    blockingReasons: [],
    warningReasons: [],
    operatorTargetStock: null,
    reviewNote: null,
    ...patch,
  };
}

function buildManySnapshotItems(count: number): SellpiaStockSnapshotItem[] {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const idSuffix = String(number).padStart(12, '0');
    return buildSnapshotItem({
      id: `00000000-0000-4000-8000-${idSuffix}`,
      rowNumber: number + 1,
      sellpiaProductCode: `SP-${String(number).padStart(3, '0')}`,
    });
  });
}

async function uploadSellpiaFixture(): Promise<void> {
  await userEvent.upload(screen.getByLabelText('Sellpia XLS/XLSX/CSV'), new File(['xlsx'], 'exported-list.xlsx'));
  await userEvent.click(screen.getByRole('button', { name: '미리보기' }));
}

describe('SellpiaSync', () => {
  it('uses the shared Sellpia workbook file support label and accept list', () => {
    render(<SellpiaSync />);

    const input = screen.getByLabelText('Sellpia XLS/XLSX/CSV');
    expect(input).toHaveAttribute('accept', '.xls,.xlsx,.csv');
  });

  it('shows row-scoped import summary after upload', async () => {
    render(<SellpiaSync />);
    await uploadSellpiaFixture();

    expect(await screen.findByText('상품 수')).toBeInTheDocument();
    expect(screen.getByText('1개')).toBeInTheDocument();
    expect(screen.getByText('신규 상품 후보 0')).toBeInTheDocument();
  });

  it('disables duplicate preview submit while upload is pending', async () => {
    const user = userEvent.setup();
    importSellpiaInventoryFile.mockReturnValueOnce(new Promise(() => undefined));
    render(<SellpiaSync />);

    await user.upload(screen.getByLabelText('Sellpia XLS/XLSX/CSV'), new File(['xlsx'], 'exported-list.xlsx'));
    await user.click(screen.getByRole('button', { name: '미리보기' }));

    expect(screen.getByRole('button', { name: '미리보기' })).toBeDisabled();
  });

  it('includes needs-review Sellpia rows in the review filter and shows warning badges', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      items: [
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000102',
          sellpiaProductCode: 'SP-WARN',
          sellpiaProductName: null,
          status: 'needs_review',
          warningReasons: ['large_difference', 'missing_product_name'],
          blockingReasons: ['recent_kiditem_event'],
        }),
      ],
    }));

    render(<SellpiaSync />);
    await uploadSellpiaFixture();

    expect(await screen.findByText('SP-WARN')).toBeInTheDocument();
    expect(screen.getByText('상품명 없음')).toBeInTheDocument();
    expect(screen.getByText('큰 차이')).toBeInTheDocument();
    expect(screen.getByText('최근 KidItem 변동')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /검토/ }));

    expect(screen.queryByRole('button', { name: /추천/ })).not.toBeInTheDocument();
    expect(screen.getByText('SP-WARN')).toBeInTheDocument();
  });

  it('filters exact matched no-action rows out of the default review table', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      summary: { matchedCount: 1, reviewCount: 1 },
      items: [
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000103',
          sellpiaProductCode: 'SP-MATCH',
          sellpiaProductName: '완전 일치 상품',
          status: 'matched',
          sellpiaStock: 10,
          targetCurrentStock: 10,
          kiditemStockBefore: 10,
          diff: 0,
          diffRate: 0,
        }),
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000104',
          sellpiaProductCode: 'SP-REVIEW',
          status: 'needs_review',
        }),
      ],
    }));

    render(<SellpiaSync />);
    await uploadSellpiaFixture();

    expect(await screen.findByText('일치')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(screen.queryByText('SP-MATCH')).not.toBeInTheDocument();
    expect(screen.getByText('SP-REVIEW')).toBeInTheDocument();
  });

  it('paginates Sellpia review rows in 50-row pages', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      summary: { reviewCount: 55 },
      items: buildManySnapshotItems(55),
    }));

    render(<SellpiaSync />);
    await uploadSellpiaFixture();

    expect(await screen.findByText('SP-001')).toBeInTheDocument();
    expect(screen.getByText('SP-050')).toBeInTheDocument();
    expect(screen.queryByText('SP-051')).not.toBeInTheDocument();
    expect(screen.getByText('1-50 / 55')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전 페이지' })).toHaveTextContent('이전 페이지');
    expect(screen.getByRole('button', { name: '다음 페이지' })).toHaveTextContent('다음 페이지');

    await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }));

    expect(screen.queryByText('SP-001')).not.toBeInTheDocument();
    expect(screen.getByText('SP-051')).toBeInTheDocument();
    expect(screen.getByText('SP-055')).toBeInTheDocument();
    expect(screen.getByText('51-55 / 55')).toBeInTheDocument();
  });

  it('selects all visible Sellpia review rows on the current page', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      summary: { reviewCount: 55 },
      items: buildManySnapshotItems(55),
    }));

    render(<SellpiaSync />);
    await uploadSellpiaFixture();

    const selectPage = await screen.findByRole('checkbox', { name: '현재 페이지 모두 선택' });
    await userEvent.click(selectPage);

    expect(screen.getByText('선택 50건')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'select-00000000-0000-4000-8000-000000000001' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'select-00000000-0000-4000-8000-000000000050' })).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }));

    expect(screen.getByText('선택 50건')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '현재 페이지 모두 선택' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('checkbox', { name: '현재 페이지 모두 선택' }));

    expect(screen.getByText('선택 55건')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'select-00000000-0000-4000-8000-000000000051' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'select-00000000-0000-4000-8000-000000000055' })).toBeChecked();
  });

  it('uses a fixed Sellpia review table instead of a horizontal scroll container', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      summary: { reviewCount: 1 },
      items: [
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000401',
          sellpiaProductCode: 'SP-LONG-CODE-401',
          sellpiaProductName: '가로 스크롤을 만들 수 있는 아주 긴 Sellpia 상품명',
        }),
      ],
    }));

    render(<SellpiaSync />);
    await uploadSellpiaFixture();

    const table = await screen.findByRole('table');

    expect(table.parentElement).not.toHaveClass('overflow-x-auto');
    expect(table.parentElement).toHaveClass('overflow-hidden');
    expect(table).toHaveClass('table-fixed');
  });

  it('returns to the first Sellpia review page when the filter changes', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      summary: { reviewCount: 1, rejectedCount: 51 },
      items: [
        ...buildManySnapshotItems(51).map((item) => ({
          ...item,
          status: 'rejected' as const,
          blockingReasons: ['parse_warning' as const],
        })),
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000991',
          rowNumber: 53,
          sellpiaProductCode: 'SP-REVIEW',
          status: 'needs_review',
          blockingReasons: ['recent_kiditem_event'],
        }),
      ],
    }));

    render(<SellpiaSync />);
    await uploadSellpiaFixture();
    await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }));

    expect(screen.getByText('51-52 / 52')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /검토/ }));

    expect(screen.getByText('SP-REVIEW')).toBeInTheDocument();
    expect(screen.getByText('1-1 / 1')).toBeInTheDocument();
  });

  it('shows new product candidate editors only in the candidate filter flow', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      summary: { newProductCandidateCount: 1 },
      items: [
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000301',
          sellpiaProductCode: 'SP-NEW',
          sellpiaProductName: '신규 상품',
          sellpiaStock: 3,
          status: 'new_product_candidate',
          productOptionId: null,
          inventoryId: null,
          blockingReasons: ['new_product_candidate'],
        }),
      ],
      newProductCandidates: [
        {
          id: '00000000-0000-4000-8000-000000000311',
          snapshotItemId: '00000000-0000-4000-8000-000000000301',
          sellpiaProductCode: 'SP-NEW',
          sellpiaProductName: '신규 상품',
          sellpiaStock: 3,
          safetyStock: 0,
          barcode: null,
          status: 'pending',
          operatorInitialStock: 3,
        },
      ],
    }));

    render(<SellpiaSync />);
    await uploadSellpiaFixture();

    expect(await screen.findByText('신규 상품 후보 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '후보 적용' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /신규 후보/ }));

    expect(screen.getByText('신규 상품 후보 처리')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '후보 적용' })).toBeInTheDocument();
  });

  it('does not render the raw row table inside the candidate filter flow', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      summary: { newProductCandidateCount: 1 },
      items: [
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000302',
          sellpiaProductCode: 'SP-NEW-TABLE',
          sellpiaProductName: '중복 후보',
          sellpiaStock: 3,
          status: 'new_product_candidate',
          productOptionId: null,
          inventoryId: null,
          blockingReasons: ['new_product_candidate'],
        }),
      ],
      newProductCandidates: [
        {
          id: '00000000-0000-4000-8000-000000000312',
          snapshotItemId: '00000000-0000-4000-8000-000000000302',
          sellpiaProductCode: 'SP-NEW-TABLE',
          sellpiaProductName: '중복 후보',
          sellpiaStock: 3,
          safetyStock: 0,
          barcode: null,
          status: 'pending',
          operatorInitialStock: 3,
        },
      ],
    }));

    render(<SellpiaSync />);
    await uploadSellpiaFixture();
    await userEvent.click(screen.getByRole('button', { name: /신규 후보/ }));

    expect(screen.getByText('신규 상품 후보 처리')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '후보 적용' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('paginates new product candidate editors with visible candidate rows', async () => {
    const candidates = Array.from({ length: 55 }, (_, index) => {
      const number = index + 1;
      const idSuffix = String(number).padStart(12, '0');
      const itemId = `00000000-0000-4000-8000-${idSuffix}`;
      const productCode = `SP-NEW-${String(number).padStart(3, '0')}`;
      const productName = `신규 상품 ${String(number).padStart(3, '0')}`;
      return {
        item: buildSnapshotItem({
          id: itemId,
          rowNumber: number + 1,
          sellpiaProductCode: productCode,
          sellpiaProductName: productName,
          sellpiaStock: number,
          status: 'new_product_candidate',
          productOptionId: null,
          inventoryId: null,
          blockingReasons: ['new_product_candidate'],
        }),
        candidate: {
          id: `00000000-0000-4000-8001-${idSuffix}`,
          snapshotItemId: itemId,
          sellpiaProductCode: productCode,
          sellpiaProductName: productName,
          sellpiaStock: number,
          safetyStock: 0,
          barcode: null,
          status: 'pending' as const,
          operatorInitialStock: number,
        },
      };
    });
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      summary: { newProductCandidateCount: 55 },
      items: candidates.map(({ item }) => item),
      newProductCandidates: candidates.map(({ candidate }) => candidate),
    }));

    render(<SellpiaSync />);
    await uploadSellpiaFixture();
    await userEvent.click(screen.getByRole('button', { name: /신규 후보/ }));

    expect(await screen.findByText('신규 상품 후보 처리')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '후보 적용' })).toHaveLength(50);
    expect(screen.getAllByDisplayValue('신규 상품 001')).toHaveLength(2);
    expect(screen.queryAllByDisplayValue('신규 상품 051')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }));

    expect(screen.getAllByRole('button', { name: '후보 적용' })).toHaveLength(5);
    expect(screen.getAllByDisplayValue('신규 상품 051')).toHaveLength(2);
  });

  it('requires an approval reason for large difference rows', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      items: [
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000103',
          sellpiaProductCode: 'SP-LARGE',
          status: 'needs_review',
          warningReasons: ['large_difference'],
        }),
      ],
    }));

    render(<SellpiaSync />);
    await uploadSellpiaFixture();

    expect(screen.getByRole('button', { name: '승인' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('reason-00000000-0000-4000-8000-000000000103'), '실사 확인');
    expect(screen.getByRole('button', { name: '승인' })).toBeEnabled();
  });

  it('bulk approves selected safe Sellpia rows and reports partial failure', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      items: [
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000201',
          sellpiaProductCode: 'SP-1',
        }),
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000202',
          sellpiaProductCode: 'SP-2',
        }),
      ],
    }));
    approveSellpiaSnapshotItems.mockResolvedValueOnce([
      { itemId: '00000000-0000-4000-8000-000000000201', ok: true },
      { itemId: '00000000-0000-4000-8000-000000000202', ok: false, error: 'already applied' },
    ]);

    render(<SellpiaSync />);
    await uploadSellpiaFixture();
    await userEvent.click(screen.getByRole('checkbox', { name: 'select-00000000-0000-4000-8000-000000000201' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'select-00000000-0000-4000-8000-000000000202' }));
    await userEvent.click(screen.getByRole('button', { name: /선택 승인/ }));

    expect(approveSellpiaSnapshotItems).toHaveBeenCalledTimes(1);
    expect(screen.getByText('선택 처리 완료 승인 1건 · 실패 1건 · 제외 0건')).toBeInTheDocument();
  });

  it('keeps unsafe selected rows selected and explains skipped approval reasons', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      items: [
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000203',
          sellpiaProductCode: 'SP-SAFE',
        }),
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000204',
          sellpiaProductCode: 'SP-BLOCK',
          blockingReasons: ['duplicate_code'],
        }),
      ],
    }));
    approveSellpiaSnapshotItems.mockResolvedValueOnce([
      { itemId: '00000000-0000-4000-8000-000000000203', ok: true },
    ]);

    render(<SellpiaSync />);
    await uploadSellpiaFixture();
    await userEvent.click(screen.getByRole('checkbox', { name: 'select-00000000-0000-4000-8000-000000000203' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'select-00000000-0000-4000-8000-000000000204' }));
    await userEvent.click(screen.getByRole('button', { name: /선택 승인/ }));

    expect(approveSellpiaSnapshotItems).toHaveBeenCalledWith([
      { itemId: '00000000-0000-4000-8000-000000000203', targetCurrentStock: 10, reason: undefined },
    ]);
    expect(screen.getByText('선택 처리 완료 승인 1건 · 실패 0건 · 제외 1건')).toBeInTheDocument();
    expect(screen.getByText('SP-BLOCK: 중복 코드')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'select-00000000-0000-4000-8000-000000000204' })).toBeChecked();
  });
});
