import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectRocketPoRowsFromExtension } from '@/lib/rocket-sales-collection';
import { previewRocketPurchases } from '../lib/rocket-purchase-preview-api';
import { RocketPurchaseWorkspace } from './RocketPurchaseWorkspace';
import type {
  RocketPoCatalogPublication,
  RocketPurchasePreviewRow,
} from '@kiditem/shared/rocket-purchase-preview';

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
): RocketPurchasePreviewRow {
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
  };
}

function catalogPublication(rowCount = 0): RocketPoCatalogPublication {
  return {
    run: {
      id: '55555555-5555-4555-8555-555555555555',
      sourceType: 'coupang_rocket_po_catalog',
      channelAccountId: ACCOUNT_ID,
      fileName: 'rocket-po-catalog.json',
      fileHash: 'a'.repeat(64),
      status: 'completed',
      rowCount,
      importedAt: '2026-07-16T00:00:00.000Z',
      lastVerifiedAt: null,
      verificationCount: 0,
      lastTrigger: null,
      freshnessGeneration: null,
      manualFreshExportConfirmedAt: null,
      manualFreshExportConfirmedBy: null,
      qualityReport: null,
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
    },
    duplicate: false,
    changes: {
      createdProductCount: 0,
      updatedProductCount: 0,
      createdSkuCount: 0,
      updatedSkuCount: 0,
    },
  };
}

describe('RocketPurchaseWorkspace', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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
      catalog: catalogPublication(),
      rows: [],
    });
  });

  it('offers recalculation but keeps actual confirmation disabled in 0.1.19', () => {
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    expect(screen.getByRole('button', { name: '미리보기 다시 계산' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '로켓 발주 확정' })).toBeDisabled();
    expect(screen.getByText('0.1.19에서는 검토만 가능')).toBeInTheDocument();
  });

  it('initializes the query range from the local calendar day without UTC conversion', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 16, 0, 30));
    const isoSpy = vi.spyOn(Date.prototype, 'toISOString')
      .mockReturnValue('1999-01-01T00:00:00.000Z');

    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    expect(screen.getByLabelText('조회 시작일')).toHaveValue('2026-07-16');
    expect(screen.getByLabelText('조회 종료일')).toHaveValue('2026-07-16');
    isoSpy.mockRestore();
    vi.useRealTimers();
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

  it('shows a clear no-PO state and collection evidence for a legitimate zero-row run', async () => {
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(await screen.findByText('해당 기간에 검토할 로켓 PO가 없습니다.'))
      .toBeInTheDocument();
    expect(screen.getByText(/목록 1\/1페이지/)).toBeInTheDocument();
    expect(screen.getByText(/PO 0건/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns when the backend blocks an otherwise locally complete zero-row collection', async () => {
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      rows: [],
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '서버가 수집 결과를 차단했습니다.',
    );
    expect(screen.getByText('수집 결과가 차단되어 검토할 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('해당 기간에 검토할 로켓 PO가 없습니다.'))
      .not.toBeInTheDocument();
  });

  it('does not present a backend-blocked zero-row collection as a normal no-PO result', async () => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: '',
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
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('수집 범위가 불완전합니다.');
    expect(screen.getByText('수집 결과가 차단되어 검토할 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('해당 기간에 검토할 로켓 PO가 없습니다.'))
      .not.toBeInTheDocument();
  });

  it.each([
    {
      label: '목록 20페이지 제한',
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 20,
        totalListPages: 20,
        truncated: false,
        detailPoCount: 1,
        failedPoNumbers: [],
      },
      rows: [lineA],
    },
    {
      label: '상세 40건 제한',
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 40,
        failedPoNumbers: [],
      },
      rows: Array.from({ length: 40 }, (_, index) => ({
        ...lineA,
        poLineId: `${1001 + index}:P-${index}:8800000000001:1`,
        poNumber: `${1001 + index}`,
        productNo: `P-${index}`,
      })),
    },
  ])('warns when collection reaches the server $label hard limit', async ({ collection, rows }) => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection,
      rows,
      poCount: rows.length,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: collection.collectionRunId,
      catalog: null,
      rows: [],
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('수집 범위가 불완전합니다.');
  });

  it.each([
    {
      label: 'retained row vendor differs from evidence',
      rows: [{ ...lineA, vendorId: 'OTHER-VENDOR' }],
      detailPoCount: 1,
    },
    {
      label: 'detail count differs from unique retained PO count',
      rows: [lineA, { ...lineB, poNumber: lineA.poNumber }],
      detailPoCount: 2,
    },
  ])('warns when $label', async ({ rows, detailPoCount }) => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount,
        failedPoNumbers: [],
      },
      rows,
      poCount: rows.length,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      rows: [],
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('수집 범위가 불완전합니다.');
  });

  it('warns when the collected list or PO details are incomplete', async () => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 2,
        truncated: true,
        detailPoCount: 1,
        failedPoNumbers: ['1002'],
      },
      rows: [lineA],
      poCount: 2,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      rows: [previewRow(lineA, 3)],
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '수집 범위가 불완전합니다. 누락된 PO를 확인한 뒤 다시 계산해 주세요.',
    );
    expect(screen.getByText(/목록 1\/2페이지/)).toBeInTheDocument();
    expect(screen.getByText(/상세 1\/2건/)).toBeInTheDocument();
    expect(screen.getByText(/실패 PO 1건/)).toBeInTheDocument();
  });

  it.each([
    ['collection_incomplete', '수집 범위가 불완전합니다.'],
    ['vendor_mismatch', '선택한 로켓 채널 계정과 수집한 PO의 공급사가 일치하지 않습니다.'],
  ] as const)(
    'aggregates the server %s preview reason into an operator warning',
    async (reason, warning) => {
      vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
        collection: {
          collectionRunId: '22222222-2222-4222-8222-222222222222',
          vendorId: 'VENDOR-1',
          listPagesRead: 1,
          totalListPages: 1,
          truncated: false,
          detailPoCount: 1,
          failedPoNumbers: [],
        },
        rows: [lineA],
        poCount: 1,
      });
      vi.mocked(previewRocketPurchases).mockResolvedValue({
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        catalog: null,
        rows: [{ ...previewRow(lineA, 0), reason }],
      });
      const user = userEvent.setup();
      render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

      await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(warning);
    },
  );

  it('renders every preview reason as Korean operator guidance', async () => {
    const reasonRows = [
      ['mapping_required', '상품 매칭 필요'],
      ['component_inactive', '비활성 Sellpia 구성품'],
      ['insufficient_capacity', 'Sellpia 재고 부족'],
      ['collection_incomplete', '수집 자료 불완전'],
      ['vendor_mismatch', '채널 계정 불일치'],
    ] as const;
    const rows = reasonRows.map(([reason], index) => ({
      ...previewRow({
        ...lineA,
        poLineId: `${lineA.poLineId}-${index}`,
        poNumber: `${1001 + index}`,
        productNo: `P-${index}`,
      }, 0),
      reason,
    }));
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: rows.length,
        failedPoNumbers: [],
      },
      rows: rows.map((row) => ({
        ...lineA,
        poLineId: row.poLineId,
        poNumber: row.poNumber,
        productNo: row.productNo,
      })),
      poCount: rows.length,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      rows,
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    for (const [, message] of reasonRows) {
      expect(await screen.findByText(message)).toBeInTheDocument();
    }
  });

  it('clamps review quantities to integer values between zero and the row maximum', async () => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
      collection: {
        collectionRunId: '22222222-2222-4222-8222-222222222222',
        vendorId: 'VENDOR-1',
        listPagesRead: 1,
        totalListPages: 1,
        truncated: false,
        detailPoCount: 1,
        failedPoNumbers: [],
      },
      rows: [lineA],
      poCount: 1,
    });
    vi.mocked(previewRocketPurchases).mockResolvedValue({
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      rows: [previewRow(lineA, 3)],
    });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);
    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));
    const quantity = await screen.findByRole('spinbutton', { name: '1001 검토수량' });

    expect(quantity).toHaveAttribute('step', '1');
    fireEvent.change(quantity, { target: { value: '2.9' } });
    expect(quantity).toHaveValue(2);
    fireEvent.change(quantity, { target: { value: '9' } });
    expect(quantity).toHaveValue(3);
    fireEvent.change(quantity, { target: { value: '-3' } });
    expect(quantity).toHaveValue(0);
  });

  it('gets an unedited fresh max before dropping and clamping retained edits', async () => {
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
      })
      .mockResolvedValueOnce({
        collectionRunId: '33333333-3333-4333-8333-333333333333',
        catalog: null,
        rows: [{
          ...previewRow(lineB, 2),
          editedQuantity: 2,
          recommendedQuantity: 2,
        }],
      });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));
    const editA = await screen.findByRole('spinbutton', { name: '1001 검토수량' });
    const editB = screen.getByRole('spinbutton', { name: '1002 검토수량' });
    await user.clear(editA);
    await user.type(editA, '3');
    await user.clear(editB);
    await user.type(editB, '4');
    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    await waitFor(() => expect(previewRocketPurchases).toHaveBeenCalledTimes(3));
    expect(vi.mocked(previewRocketPurchases).mock.calls[1]?.[0].editedQuantities)
      .toEqual({});
    expect(vi.mocked(previewRocketPurchases).mock.calls[2]?.[0].editedQuantities)
      .toEqual({ [lineB.poLineId]: 2 });
    expect(screen.getByRole('spinbutton', { name: '1002 검토수량' })).toHaveValue(2);
  });

  it('asks the server to jointly clamp retained edits that share component stock', async () => {
    vi.mocked(collectRocketPoRowsFromExtension).mockResolvedValue({
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
    });
    const baseline = {
      collectionRunId: '22222222-2222-4222-8222-222222222222',
      catalog: null,
      rows: [previewRow(lineA, 10), previewRow(lineB, 9)],
    };
    vi.mocked(previewRocketPurchases)
      .mockResolvedValueOnce(baseline)
      .mockResolvedValueOnce(baseline)
      .mockResolvedValueOnce({
        ...baseline,
        rows: [
          {
            ...previewRow(lineA, 10),
            editedQuantity: 10,
            recommendedQuantity: 10,
          },
          {
            ...previewRow(lineB, 0),
            editedQuantity: 0,
            recommendedQuantity: 0,
          },
        ],
      });
    const user = userEvent.setup();
    render(<RocketPurchaseWorkspace channelAccountId={ACCOUNT_ID} />);

    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));
    const editA = await screen.findByRole('spinbutton', { name: '1001 검토수량' });
    const editB = screen.getByRole('spinbutton', { name: '1002 검토수량' });
    await user.clear(editA);
    await user.type(editA, '10');
    await user.clear(editB);
    await user.type(editB, '9');
    await user.click(screen.getByRole('button', { name: '미리보기 다시 계산' }));

    await waitFor(() => expect(previewRocketPurchases).toHaveBeenCalledTimes(3));
    expect(vi.mocked(previewRocketPurchases).mock.calls[2]?.[0]).toMatchObject({
      editedQuantities: {
        [lineA.poLineId]: 10,
        [lineB.poLineId]: 9,
      },
      clampEditedQuantities: true,
    });
    expect(screen.getByRole('spinbutton', { name: '1001 검토수량' })).toHaveValue(10);
    expect(screen.getByRole('spinbutton', { name: '1002 검토수량' })).toHaveValue(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
