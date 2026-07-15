import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
}));

vi.mock('./components/InventoryWorkspace', () => ({
  InventoryWorkspace: () => <div>inventory</div>,
}));

describe('InventoryHubPage', () => {
  it('uses the develop inventory tab order without a direct stock mutation tab', async () => {
    render(<InventoryHubPage />);
    const tabs = within(screen.getByTestId('tab-layout-tabs')).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      '개요',
      '재고',
      '확인 필요',
      '기록',
    ]);
    expect(screen.queryByRole('tab', { name: 'Sellpia 동기화' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '로켓 수동 처리' })).not.toBeInTheDocument();
  });
});
