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
  GeneralPurchaseOrdersWorkspace: ({ orderId, supplierId }: { orderId?: string; supplierId?: string }) => (
    <div>general {orderId} {supplierId}</div>
  ),
}));

vi.mock('./RocketPurchaseOrdersWorkspace', () => ({
  RocketPurchaseOrdersWorkspace: () => <div>rocket workspace</div>,
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
    expect(screen.getByText('general po-1 supplier-1')).toBeInTheDocument();
    expect(screen.queryByText('rocket workspace')).not.toBeInTheDocument();
  });

  it('mounts only the Rocket preview for tab=rocket', () => {
    navigation.params = new URLSearchParams('tab=rocket');
    render(<PurchaseOrdersWorkspace />);

    expect(screen.getByText('rocket workspace')).toBeInTheDocument();
    expect(screen.queryByText(/general/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });
});
