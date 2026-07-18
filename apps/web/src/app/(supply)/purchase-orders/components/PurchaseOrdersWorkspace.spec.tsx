import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PurchaseOrdersWorkspace } from './PurchaseOrdersWorkspace';

const navigation = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/purchase-orders',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => navigation.params,
}));

vi.mock('./GeneralPurchaseOrdersWorkspace', () => ({
  GeneralPurchaseOrdersWorkspace: ({ orderId, supplierId }: {
    orderId?: string;
    supplierId?: string;
  }) => (
    <div data-testid="general-workspace"><h1>발주 관리</h1>general {orderId} {supplierId}</div>
  ),
}));

describe('<PurchaseOrdersWorkspace>', () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
  });

  it('defaults invalid tabs to general and forwards deep-link filters', () => {
    navigation.params = new URLSearchParams(
      'tab=invalid&orderId=po-1&supplierId=supplier-1',
    );
    render(<PurchaseOrdersWorkspace />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: '발주 관리' })).toBeInTheDocument();
    expect(screen.getByTestId('general-workspace')).toHaveTextContent(
      'general po-1 supplier-1',
    );
    expect(screen.queryByText('발주 운영')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('does not expose a duplicate Rocket workspace for the obsolete tab query', () => {
    navigation.params = new URLSearchParams('tab=rocket');
    render(<PurchaseOrdersWorkspace />);

    expect(screen.getByRole('heading', { level: 1, name: '발주 관리' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '로켓 발주 수량 검토' }))
      .not.toBeInTheDocument();
  });
});
