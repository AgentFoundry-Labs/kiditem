import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryHubWorkspace } from './InventoryHubWorkspace';

const pushMock = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/inventory-hub',
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => navigation.params,
}));

vi.mock('./InventoryWorkspace', () => ({
  InventoryWorkspace: () => <div>inventory workspace</div>,
}));

vi.mock('./InventoryOperationWorkspaces', () => ({
  InventoryOverviewWorkspace: () => <div>overview workspace</div>,
  InventoryAttentionWorkspace: () => <div>attention workspace</div>,
  InventoryHistoryWorkspace: () => <div>history workspace</div>,
}));

describe('<InventoryHubWorkspace>', () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
    pushMock.mockReset();
  });

  it('owns one heading and lazily mounts the URL-selected canonical view', () => {
    navigation.params = new URLSearchParams('tab=attention&warehouse=main');
    render(<InventoryHubWorkspace />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByText('attention workspace')).toBeInTheDocument();
    expect(screen.queryByText('inventory workspace')).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '개요',
      '재고',
      '확인 필요',
      '기록',
    ]);
  });

  it('keeps unrelated query state when selecting a view', () => {
    navigation.params = new URLSearchParams('warehouse=main&tab=overview');
    render(<InventoryHubWorkspace />);

    fireEvent.click(screen.getByRole('tab', { name: '재고' }));
    expect(pushMock).toHaveBeenCalledWith(
      '/inventory-hub?warehouse=main&tab=inventory',
    );
  });
});
