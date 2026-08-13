import { render, screen, within } from '@testing-library/react';
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
vi.mock('./components/SellpiaInventoryWorkspace', () => ({
  SellpiaInventoryWorkspace: () => <div>sellpia inventory</div>,
}));
vi.mock('../stock-ops/components/StockTransfers', () => ({ default: () => <div>transfers</div> }));
vi.mock('../stock-ops/components/ReturnTransfers', () => ({ default: () => <div>returns</div> }));

function selectedTabLabel() {
  return within(screen.getByTestId('tab-layout-tabs'))
    .getAllByRole('tab')
    .find((tab) => tab.getAttribute('aria-selected') === 'true')
    ?.textContent;
}

beforeEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  navigation.params = new URLSearchParams();
});

describe('InventoryHubPage', () => {
  it('renders only 재고 현황 and 셀피아 재고 without a nested tab strip', () => {
    render(<InventoryHubPage />);

    const tabs = within(screen.getByTestId('tab-layout-tabs')).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['재고 현황', '셀피아 재고']);
    expect(screen.getByRole('heading', { level: 1, name: '재고 관리' })).toBeInTheDocument();
    expect(screen.getAllByTestId('tab-layout-tabs')).toHaveLength(1);
    expect(screen.queryByRole('tab', { name: 'Sellpia 동기화' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '로켓 수동 처리' })).not.toBeInTheDocument();
  });

  it('keeps stock and io on 재고 현황 without assets or purchase orders', () => {
    render(<InventoryHubPage />);

    for (const section of ['inventory', 'transfers', 'returns']) {
      expect(screen.getByText(section)).toBeInTheDocument();
    }
    expect(screen.queryByText('assets')).not.toBeInTheDocument();
    expect(screen.queryByText('purchase orders')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '발주 관리' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '입출고' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '수불부' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '재고자산' })).not.toBeInTheDocument();
  });

  it('renders the inventory-owned Sellpia table tab', () => {
    navigation.params = new URLSearchParams('tab=sellpia-inventory');
    render(<InventoryHubPage />);

    expect(screen.getByText('sellpia inventory')).toBeInTheDocument();
    expect(selectedTabLabel()).toBe('셀피아 재고');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it.each([
    'sellpia-sync',
    'rocket-events',
    'overview',
    'audits',
    'freshness',
    'attention',
    'checks',
    'po',
    'io',
    'ledger',
    'assets',
    'records',
    'sellpia-zero',
    'mapping-attention',
  ])('normalizes the retired ?tab=%s deep link to 재고 현황', (legacyTab) => {
    navigation.params = new URLSearchParams(`tab=${legacyTab}`);
    render(<InventoryHubPage />);

    expect(replaceMock).toHaveBeenCalledWith('/inventory-hub?tab=status');
  });

  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])(
    'ignores the inherited prototype key ?tab=%s instead of redirecting to it',
    (protoKey) => {
      navigation.params = new URLSearchParams(`tab=${protoKey}`);
      render(<InventoryHubPage />);

      expect(replaceMock).not.toHaveBeenCalled();
      expect(selectedTabLabel()).toBe('재고 현황');
    },
  );
});
