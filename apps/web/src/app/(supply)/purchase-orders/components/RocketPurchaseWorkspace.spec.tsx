import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectRocketPoRowsFromExtension } from '@/lib/rocket-sales-collection';
import { previewRocketPurchases } from '../lib/rocket-purchase-preview-api';
import { RocketPurchaseWorkspace } from './RocketPurchaseWorkspace';

vi.mock('@/lib/rocket-sales-collection', () => ({
  collectRocketPoRowsFromExtension: vi.fn(),
}));
vi.mock('../lib/rocket-purchase-preview-api', () => ({
  previewRocketPurchases: vi.fn(),
}));

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const lineA = {
  poLineId: '1001:P-A:8800000000001:1',
  poNumber: '1001',
  vendorId: 'VENDOR-1',
  productNo: 'P-A',
  barcode: '8800000000001',
  productName: '상품 A',
  orderQty: 3,
  plannedDeliveryDate: '2026-07-20',
};
const lineB = {
  ...lineA,
  poLineId: '1002:P-B:8800000000002:1',
  poNumber: '1002',
  productNo: 'P-B',
  barcode: '8800000000002',
  productName: '상품 B',
};

function previewRow(
  row: typeof lineA,
  maxQuantity: number,
) {
  return {
    poLineId: row.poLineId,
    poNumber: row.poNumber,
    productNo: row.productNo,
    productName: row.productName,
    orderQuantity: row.orderQty,
    recommendedQuantity: Math.min(row.orderQty, maxQuantity),
    maxQuantity,
    editedQuantity: null,
    reason: null,
    channelSkuId: null,
    components: [],
  } as const;
}

describe('RocketPurchaseWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 0,
        failedPoNumbers: [],
      },
      rows: [],
      poCount: 0,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      rows: [],
    });
  });

  it('offers recalculation but keeps actual confirmation disabled in 0.1.19', () => {
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    expect(screen.getByRole('button', { name: '미리보기 다시 계산' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '로켓 발주 확정' })).toBeDisabled();
    expect(screen.getByText('0.1.19에서는 검토만 가능')).toBeInTheDocument();
  });

  it('collects evidence then sends only a preview action', async () => {
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(collectRocketPoRowsFromExtension).toHaveBeenCalledTimes(1);
    expect(previewRocketPurchases).toHaveBeenCalledWith(expect.objectContaining({
      channelAccountId: ACCOUNT_ID,
      editedQuantities: {},
    }));
    expect(screen.queryByText(/예약 완료|확정 파일 생성|제출 완료/)).not.toBeInTheDocument();
  });

  it('drops disappeared edits and clamps retained edits to the latest backend max', async () => {
    vi.mocked(collectRocketPoRowsFromExtension)
      .mockResolvedValueOnce({
        collection: {
          collectionRunId: '22222222-2222-4222-8222-222222222222',
          vendorId: 'VENDOR-1',
          listPagesRead: 1,
          totalListPages: 1,
          truncated: false,
          detailPoCount: 2,
          failedPoNumbers: [],
        },
        rows: [lineA, lineB],
        poCount: 2,
      })
      .mockResolvedValueOnce({
        collection: {
          collectionRunId: '33333333-3333-4333-8333-333333333333',
          vendorId: 'VENDOR-1',
          listPagesRead: 1,
          totalListPages: 1,
          truncated: false,
          detailPoCount: 1,
          failedPoNumbers: [],
        },
        rows: [lineB],
        poCount: 1,
      });
    vi.mocked(previewRocketPurchases)
      .mockResolvedValueOnce({
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        catalog: null,
        rows: [previewRow(lineA, 3), previewRow(lineB, 4)],
      })
      .mockResolvedValueOnce({
        collectionRunId: '33333333-3333-4333-8333-333333333333',
        catalog: null,
        rows: [previewRow(lineB, 2)],
      });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));
    const editA = await screen.findByRole('spinbutton', { name: '1001 검토수량' });
    const editB = screen.getByRole('spinbutton', { name: '1002 검토수량' });
    await user.clear(editA);
    await user.type(editA, '3');
    await user.clear(editB);
    await user.type(editB, '9');
    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    await waitFor(() => expect(previewRocketPurchases).toHaveBeenCalledTimes(2));
    expect(vi.mocked(previewRocketPurchases).mock.calls[1]?.[0].editedQuantities)
      .toEqual({ [lineB.poLineId]: 4 });
  });
});
