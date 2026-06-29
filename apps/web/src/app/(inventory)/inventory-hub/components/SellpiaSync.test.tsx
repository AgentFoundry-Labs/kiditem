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
    recommendedCount: 1,
    reviewCount: 0,
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
      recommendedCount: 0,
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
    status: 'recommended',
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
  await userEvent.upload(screen.getByLabelText('Sellpia XLSX'), new File(['xlsx'], 'exported-list.xlsx'));
  await userEvent.click(screen.getByRole('button', { name: '미리보기' }));
}

describe('SellpiaSync', () => {
  it('shows row-scoped import summary after upload', async () => {
    render(<SellpiaSync />);
    await uploadSellpiaFixture();

    expect(await screen.findByText('1 rows')).toBeInTheDocument();
    expect(screen.getByText('신규 상품 후보 0')).toBeInTheDocument();
  });

  it('disables duplicate preview submit while upload is pending', async () => {
    const user = userEvent.setup();
    importSellpiaInventoryFile.mockReturnValueOnce(new Promise(() => undefined));
    render(<SellpiaSync />);

    await user.upload(screen.getByLabelText('Sellpia XLSX'), new File(['xlsx'], 'exported-list.xlsx'));
    await user.click(screen.getByRole('button', { name: '미리보기' }));

    expect(screen.getByRole('button', { name: '미리보기' })).toBeDisabled();
  });

  it('filters Sellpia review rows and shows warning badges', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      items: [
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000101',
          sellpiaProductCode: 'SP-REC',
          status: 'recommended',
        }),
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000102',
          sellpiaProductCode: 'SP-WARN',
          status: 'needs_review',
          warningReasons: ['large_difference'],
          blockingReasons: ['recent_kiditem_event'],
        }),
      ],
    }));

    render(<SellpiaSync />);
    await uploadSellpiaFixture();

    expect(await screen.findByText('SP-REC')).toBeInTheDocument();
    expect(screen.getByText('SP-WARN')).toBeInTheDocument();
    expect(screen.getByText('큰 차이')).toBeInTheDocument();
    expect(screen.getByText('최근 KidItem 변동')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /검토/ }));

    expect(screen.queryByText('SP-REC')).not.toBeInTheDocument();
    expect(screen.getByText('SP-WARN')).toBeInTheDocument();
  });

  it('paginates Sellpia review rows in 50-row pages', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      summary: { recommendedCount: 55, matchedCount: 55 },
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

  it('returns to the first Sellpia review page when the filter changes', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      summary: { recommendedCount: 51, reviewCount: 1, matchedCount: 52 },
      items: [
        ...buildManySnapshotItems(51),
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

  it('requires an approval reason for large difference rows', async () => {
    importSellpiaInventoryFile.mockResolvedValueOnce(buildImportResponse({
      items: [
        buildSnapshotItem({
          id: '00000000-0000-4000-8000-000000000103',
          sellpiaProductCode: 'SP-LARGE',
          status: 'recommended',
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
