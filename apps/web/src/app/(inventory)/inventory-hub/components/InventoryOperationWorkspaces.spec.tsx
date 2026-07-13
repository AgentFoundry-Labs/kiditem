import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  InventoryAuditWorkspace,
  InventoryIoWorkspace,
  InventoryLedgerWorkspace,
  RocketInventoryWorkspace,
} from './InventoryOperationWorkspaces';

vi.mock('../../stock-ops/components/StockTransfers', () => ({
  default: ({ readOnly = false }: { readOnly?: boolean }) => (
    <div data-testid="stock-transfers" data-read-only={String(readOnly)} />
  ),
}));

vi.mock('../../stock-ops/components/ReturnTransfers', () => ({
  default: ({ readOnly = false }: { readOnly?: boolean }) => (
    <div data-testid="return-transfers" data-read-only={String(readOnly)} />
  ),
}));

vi.mock('./ChannelAvailability', () => ({
  default: () => <div data-testid="channel-availability" />,
}));

vi.mock('./SellpiaImportHistory', () => ({
  default: () => <div data-testid="sellpia-import-history" />,
}));

describe('inventory operation workspaces', () => {
  it('renders transfer and return record creation in 입출고', () => {
    render(<InventoryIoWorkspace />);

    expect(screen.getByTestId('stock-transfers')).toHaveAttribute('data-read-only', 'false');
    expect(screen.getByTestId('return-transfers')).toHaveAttribute('data-read-only', 'false');
  });

  it('renders the ledger with read-only transfer and return records', () => {
    render(<InventoryLedgerWorkspace />);

    expect(screen.getByText('운영 기록 수불부')).toBeInTheDocument();
    expect(screen.getByTestId('stock-transfers')).toHaveAttribute('data-read-only', 'true');
    expect(screen.getByTestId('return-transfers')).toHaveAttribute('data-read-only', 'true');
  });

  it('keeps Rocket handling on channel availability without changing Sellpia stock', () => {
    render(<RocketInventoryWorkspace />);

    expect(screen.getByText('Rocket도 채널 계정으로 계산합니다. 이 화면에서는 Sellpia 현재고를 수정하지 않습니다.')).toBeInTheDocument();
    expect(screen.getByTestId('channel-availability')).toBeInTheDocument();
  });

  it('uses completed Sellpia import history as the audit record', () => {
    render(<InventoryAuditWorkspace />);

    expect(screen.getByText('Sellpia 스냅샷 실사 기록')).toBeInTheDocument();
    expect(screen.getByTestId('sellpia-import-history')).toBeInTheDocument();
  });
});
