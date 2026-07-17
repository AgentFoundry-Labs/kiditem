import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderExceptionsWorkspace } from './OrderExceptionsWorkspace';

// Regression: ISSUE-001 — compatibility redirects opened the fallback unshipped view
// Found by /qa on 2026-07-16
// Report: .gstack/qa-reports/qa-report-localhost-3000-2026-07-16.md
const navigation = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/order-hub',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => navigation.params,
}));

vi.mock('../../order-status-hub/components/OrderCompare', () => ({ default: () => <div>order compare content</div> }));
vi.mock('../../order-status-hub/components/OrderInventory', () => ({ default: () => <div>order inventory content</div> }));
vi.mock('../../order-status-hub/components/SyncCheck', () => ({ default: () => <div>sync check content</div> }));
vi.mock('./UnshippedItemsWorkspace', () => ({ UnshippedItemsWorkspace: () => <div>unshipped content</div> }));

describe('<OrderExceptionsWorkspace> compatibility views', () => {
  beforeEach(() => {
    navigation.params = new URLSearchParams();
  });

  it.each([
    ['order-inventory', '재고 위험', 'order inventory content'],
    ['order-compare', '주문 비교', 'order compare content'],
    ['sync-check', '동기화 확인', 'sync check content'],
  ])('opens redirected view=%s instead of falling back', (view, tabName, content) => {
    navigation.params = new URLSearchParams(`tab=exceptions&view=${view}`);
    render(<OrderExceptionsWorkspace />);

    expect(screen.getByRole('tab', { name: tabName })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(content)).toBeInTheDocument();
    expect(screen.queryByText('unshipped content')).not.toBeInTheDocument();
  });
});
