import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SellpiaInventoryImport, {
  SELLPIA_INVENTORY_FILE_ACCEPT,
} from './SellpiaInventoryImport';
import type { SellpiaInventoryImportResponse } from '@kiditem/shared/source-import';

const importSellpiaInventory = vi.hoisted(() => vi.fn());
const invalidateSellpiaInventory = vi.hoisted(() => vi.fn());

vi.mock('../lib/sellpia-inventory-import-api', () => ({
  importSellpiaInventory,
}));

vi.mock('../../_shared/invalidate-sellpia-inventory', () => ({
  invalidateSellpiaInventory,
}));

function renderImport() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SellpiaInventoryImport />
    </QueryClientProvider>,
  );
}

function importResponse(
  patch: Partial<SellpiaInventoryImportResponse> = {},
): SellpiaInventoryImportResponse {
  return {
    run: {
      id: '00000000-0000-4000-8000-000000000001',
      sourceType: 'sellpia_inventory',
      channelAccountId: null,
      fileName: 'exported-list (3).xls',
      fileHash: 'a'.repeat(64),
      status: 'completed',
      rowCount: 1964,
      importedAt: '2026-07-11T01:00:00.000Z',
      createdAt: '2026-07-11T01:00:00.000Z',
      updatedAt: '2026-07-11T01:00:00.000Z',
      ...patch.run,
    },
    duplicate: patch.duplicate ?? false,
    changes: {
      createdMasterProductCount: 120,
      updatedMasterProductCount: 1800,
      inactivatedMasterProductCount: 44,
      ...patch.changes,
    },
  };
}

async function chooseFile(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.upload(
    screen.getByLabelText('Sellpia 재고 파일'),
    new File(['workbook'], 'exported-list (3).xls', {
      type: 'application/vnd.ms-excel',
    }),
  );
}

beforeEach(() => {
  importSellpiaInventory.mockReset();
  importSellpiaInventory.mockResolvedValue(importResponse());
  invalidateSellpiaInventory.mockReset();
  invalidateSellpiaInventory.mockResolvedValue(undefined);
});

describe('SellpiaInventoryImport', () => {
  it('keeps import disabled until an operator selects a file', () => {
    renderImport();

    expect(screen.getByRole('button', { name: '재고 가져오기' })).toBeDisabled();
  });

  it('accepts Excel, CSV, and tabular text files supported by the parser', () => {
    renderImport();

    expect(SELLPIA_INVENTORY_FILE_ACCEPT).toBe(
      '.xls,.xlsx,.csv,text/csv,text/plain,text/tab-separated-values',
    );
    expect(screen.getByLabelText('Sellpia 재고 파일')).toHaveAttribute(
      'accept',
      SELLPIA_INVENTORY_FILE_ACCEPT,
    );
  });

  it('renders the completed run and replacement counts after import', async () => {
    const user = userEvent.setup();
    renderImport();

    await chooseFile(user);
    await user.click(screen.getByRole('button', { name: '재고 가져오기' }));

    expect(await screen.findByText('가져오기 완료')).toBeInTheDocument();
    expect(screen.getByText('exported-list (3).xls')).toBeInTheDocument();
    expect(screen.getByText('1,964')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('1,800')).toBeInTheDocument();
    expect(screen.getByText('44')).toBeInTheDocument();
    expect(importSellpiaInventory).toHaveBeenCalledTimes(1);
    expect(invalidateSellpiaInventory).toHaveBeenCalledTimes(1);
  });

  it('explains duplicate imports and shows zero changes', async () => {
    const user = userEvent.setup();
    importSellpiaInventory.mockResolvedValueOnce(importResponse({
      duplicate: true,
      changes: {
        createdMasterProductCount: 0,
        updatedMasterProductCount: 0,
        inactivatedMasterProductCount: 0,
      },
    }));
    renderImport();

    await chooseFile(user);
    await user.click(screen.getByRole('button', { name: '재고 가져오기' }));

    expect(await screen.findByText('이미 가져온 동일 파일입니다')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(3);
  });

  it('shows an import error without exposing review controls', async () => {
    const user = userEvent.setup();
    importSellpiaInventory.mockRejectedValueOnce(new Error('필수 컬럼이 없습니다'));
    renderImport();

    await chooseFile(user);
    await user.click(screen.getByRole('button', { name: '재고 가져오기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('필수 컬럼이 없습니다');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /승인/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/후보/)).not.toBeInTheDocument();
    expect(screen.queryByText(/유효 시각|기준 시각/)).not.toBeInTheDocument();
  });

  it('states that the snapshot is copied without stock adjustment or channel-row updates', () => {
    renderImport();

    expect(screen.getByText(
      'Sellpia 재고를 보고 재고로 그대로 복사하며, KidItem에서는 수량을 조정하지 않습니다.',
    )).toBeInTheDocument();
    expect(screen.getByText(
      '상품 매칭 상태는 다음에 상품 매칭 센터를 열 때 최신 재고 기준으로 조회됩니다.',
    )).toBeInTheDocument();
  });
});
