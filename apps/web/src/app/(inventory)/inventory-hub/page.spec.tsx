import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InventoryHubWorkspace } from './components/InventoryHubWorkspace';
import InventoryHubPage from './page';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/inventory-hub',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/dynamic', () => ({
  default: () => function DynamicChild() {
    return <div>동적 화면</div>;
  },
}));

vi.mock('./components/InventoryOperationWorkspaces', () => ({
  InventoryOverviewWorkspace: () => <div>overview</div>,
  InventoryAttentionWorkspace: () => <div>attention</div>,
  InventoryHistoryWorkspace: () => <div>history</div>,
  InventoryAuditWorkspace: () => <div>audits</div>,
  InventoryIoWorkspace: () => <div>io</div>,
  InventoryLedgerWorkspace: () => <div>ledger</div>,
  RocketInventoryWorkspace: () => <div>rocket events</div>,
}));

vi.mock('./components/InventoryWorkspace', () => ({
  InventoryWorkspace: () => <div>inventory</div>,
}));

vi.mock('@/app/(supply)/purchase-orders/components/GeneralPurchaseOrdersWorkspace', () => ({
  GeneralPurchaseOrdersWorkspace: () => <div>purchase orders</div>,
}));

vi.mock('@/components/sellpia-inventory', () => ({
  SellpiaWorkspaceFreshnessStatus: () => <button type="button">Sellpia 최신성</button>,
}));

describe('InventoryHubPage', () => {
  it('restores the former inventory-management title and tab order', async () => {
    render(<InventoryHubPage />);
    const tabs = within(screen.getByTestId('tab-layout-tabs')).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      '재고 현황',
      '발주 관리',
      '입출고',
      'Sellpia 동기화',
      '로켓 수동 처리',
      '수불부',
      '재고 실사',
      '재고자산',
    ]);
    expect(screen.getByRole('heading', { level: 1, name: '재고 관리' })).toBeInTheDocument();
    expect(screen.queryByText('재고 운영')).not.toBeInTheDocument();
  });

  it('keeps the replacement workspace available as an internal reusable component', () => {
    render(<InventoryHubWorkspace />);
    expect(screen.getByRole('heading', { level: 1, name: '재고 운영' })).toBeInTheDocument();
  });
});
