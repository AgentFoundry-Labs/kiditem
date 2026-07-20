import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryHubWorkspace } from './components/InventoryHubWorkspace';
import InventoryHubPage from './page';

const pushMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => navigation.params,
  usePathname: () => '/inventory-hub',
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
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
  RocketInventoryWorkspace: () => <div>rocket events</div>,
}));

vi.mock('./components/InventoryWorkspace', () => ({
  InventoryWorkspace: () => <div>inventory</div>,
}));
vi.mock('./components/StockAssets', () => ({ default: () => <div>assets</div> }));
vi.mock('../stock-ops/components/ImportFreshness', () => ({ default: () => <div>freshness</div> }));
vi.mock('../stock-ops/components/MappingAttention', () => ({ default: () => <div>mapping</div> }));
vi.mock('../stock-ops/components/ZeroItems', () => ({ default: () => <div>sellpia zero</div> }));
vi.mock('../stock-ops/components/StockTransfers', () => ({ default: () => <div>transfers</div> }));
vi.mock('../stock-ops/components/ReturnTransfers', () => ({ default: () => <div>returns</div> }));

vi.mock('@/app/(supply)/purchase-orders/components/GeneralPurchaseOrdersWorkspace', () => ({
  GeneralPurchaseOrdersWorkspace: () => <div>purchase orders</div>,
}));

vi.mock('@/components/sellpia-inventory', () => ({
  SellpiaWorkspaceFreshnessStatus: () => <button type="button">Sellpia 최신성</button>,
}));

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
  it('collapses inventory management into four tabs with no nested tab strip', () => {
    render(<InventoryHubPage />);

    const tabs = within(screen.getByTestId('tab-layout-tabs')).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      '재고 현황',
      'Sellpia 동기화',
      '로켓 수동 처리',
      '재고 점검',
    ]);
    expect(screen.getByRole('heading', { level: 1, name: '재고 관리' })).toBeInTheDocument();
    // 서브탭 없이 한 화면에 쌓는다. 탭 스트립은 페이지 전체에 하나뿐이어야 한다.
    expect(screen.getAllByTestId('tab-layout-tabs')).toHaveLength(1);
  });

  it('stacks stock, assets, purchase orders and io as sections on 재고 현황', () => {
    render(<InventoryHubPage />);

    // 발주 관리·입출고·재고자산은 별도 탭이 아니라 이 화면 안에 함께 보여야 한다.
    for (const section of ['inventory', 'assets', 'purchase orders', 'transfers', 'returns']) {
      expect(screen.getByText(section)).toBeInTheDocument();
    }
    expect(screen.queryByRole('tab', { name: '발주 관리' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '입출고' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '수불부' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '재고자산' })).not.toBeInTheDocument();
  });

  it('stacks zero-stock and mapping attention as sections on 재고 점검', () => {
    navigation.params = new URLSearchParams('tab=checks');
    render(<InventoryHubPage />);

    expect(screen.getByText('sellpia zero')).toBeInTheDocument();
    expect(screen.getByText('mapping')).toBeInTheDocument();
    expect(screen.getAllByTestId('tab-layout-tabs')).toHaveLength(1);
  });

  it('absorbs the audit and freshness views into a single Sellpia 동기화 tab', () => {
    navigation.params = new URLSearchParams('tab=sellpia-sync');
    render(<InventoryHubPage />);

    expect(screen.getByRole('heading', { level: 2, name: 'Sellpia 동기화' })).toBeInTheDocument();
    expect(screen.getByText('freshness')).toBeInTheDocument();
    expect(selectedTabLabel()).toBe('Sellpia 동기화');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it.each([
    // 4탭으로 접히면서 사라진 예전 탭 id 로 들어온 딥링크가 새 위치로 착지한다.
    ['po', '/inventory-hub?tab=status'],
    ['io', '/inventory-hub?tab=status'],
    ['ledger', '/inventory-hub?tab=status'],
    ['assets', '/inventory-hub?tab=status'],
    ['records', '/inventory-hub?tab=status'],
    ['audits', '/inventory-hub?tab=sellpia-sync'],
    ['sellpia-zero', '/inventory-hub?tab=checks'],
    ['mapping-attention', '/inventory-hub?tab=checks'],
  ])('normalizes the retired ?tab=%s deep link to %s', (legacyTab, destination) => {
    navigation.params = new URLSearchParams(`tab=${legacyTab}`);
    render(<InventoryHubPage />);

    expect(replaceMock).toHaveBeenCalledWith(destination);
  });

  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])(
    'ignores the inherited prototype key ?tab=%s instead of redirecting to it',
    (protoKey) => {
      // 객체 리터럴을 raw 쿼리값으로 인덱싱하면 Object.prototype 멤버가 잡혀
      // router.replace 에 함수가 넘어가고 화면이 스켈레톤에서 멈춘다.
      navigation.params = new URLSearchParams(`tab=${protoKey}`);
      render(<InventoryHubPage />);

      expect(replaceMock).not.toHaveBeenCalled();
      expect(selectedTabLabel()).toBe('재고 현황');
    },
  );

  it('keeps the replacement workspace available as an internal reusable component', () => {
    render(<InventoryHubWorkspace />);
    expect(screen.getByRole('heading', { level: 1, name: '재고 운영' })).toBeInTheDocument();
  });
});
