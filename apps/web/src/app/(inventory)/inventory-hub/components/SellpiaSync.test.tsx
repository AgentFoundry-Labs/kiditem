import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SellpiaSync from './SellpiaSync';

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
  resolveSellpiaCandidate,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SellpiaSync', () => {
  it('shows row-scoped import summary after upload', async () => {
    render(<SellpiaSync />);
    const input = screen.getByLabelText('Sellpia XLSX');
    await userEvent.upload(input, new File(['xlsx'], 'exported-list.xlsx'));
    await userEvent.click(screen.getByRole('button', { name: '미리보기' }));

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
});
