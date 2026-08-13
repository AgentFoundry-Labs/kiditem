import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InventoryHubPage from './page';

const pushMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => navigation.params,
  usePathname: () => '/inventory-hub',
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock('./components/InventoryWorkspace', () => ({
  InventoryWorkspace: () => <div>inventory</div>,
}));
vi.mock('../stock-ops/components/StockTransfers', () => ({
  default: () => <div>transfers</div>,
}));
vi.mock('../stock-ops/components/ReturnTransfers', () => ({
  default: () => <div>returns</div>,
}));

beforeEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  navigation.params = new URLSearchParams();
});

describe('InventoryHubPage', () => {
  it('renders one inventory workspace with transfer and return sections and no tabs', () => {
    render(<InventoryHubPage />);

    expect(screen.getByText('inventory')).toBeInTheDocument();
    expect(screen.getByText('transfers')).toBeInTheDocument();
    expect(screen.getByText('returns')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText('sellpia inventory')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it.each([
    'status',
    'sellpia-inventory',
    'sellpia-sync',
    'rocket-events',
    'constructor',
    '__proto__',
    'unknown',
  ])('removes ?tab=%s while preserving inventory filters', (tab) => {
    navigation.params = new URLSearchParams(
      `tab=${tab}&search=SP-1001&linkStatus=unlinked&page=2`,
    );
    render(<InventoryHubPage />);

    expect(replaceMock).toHaveBeenCalledWith(
      '/inventory-hub?search=SP-1001&linkStatus=unlinked&page=2',
    );
  });
});
