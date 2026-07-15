import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderHubWorkspace } from './OrderHubWorkspace';

const navigation = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/order-hub',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => navigation.params,
}));

vi.mock('./OrderCollectionWorkspace', () => ({
  OrderCollectionWorkspace: () => <div>collection workspace</div>,
}));
vi.mock('./OrderProcessingWorkspace', () => ({
  OrderProcessingWorkspace: () => <div>processing workspace</div>,
}));
vi.mock('./OrderShippingWorkspace', () => ({
  OrderShippingWorkspace: () => <div>shipping workspace</div>,
}));
vi.mock('./OrderExceptionsWorkspace', () => ({
  OrderExceptionsWorkspace: () => <div>exceptions workspace</div>,
}));

describe('<OrderHubWorkspace>', () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
  });

  it('uses the operator-action tabs and lazily mounts URL-selected content', () => {
    navigation.params = new URLSearchParams('tab=shipping');
    render(<OrderHubWorkspace />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '주문 수집',
      '주문 처리',
      '배송',
      '예외',
    ]);
    expect(screen.getByText('shipping workspace')).toBeInTheDocument();
    expect(screen.queryByText('collection workspace')).not.toBeInTheDocument();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });
});
