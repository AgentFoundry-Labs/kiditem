import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InventoryAttentionWorkspace, InventoryOverviewWorkspace } from './InventoryOperationWorkspaces';

vi.mock('next/navigation', () => ({
  usePathname: () => '/inventory-hub',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../stock-ops/components/ImportFreshness', () => ({ default: () => <div>freshness</div> }));
vi.mock('../../stock-ops/components/StockRetention', () => ({ default: () => <div>summary</div> }));
vi.mock('../../stock-ops/components/ZeroItems', () => ({ default: () => <div>sellpia zero</div> }));
vi.mock('../../stock-ops/components/OutOfStock', () => ({ default: () => <div>channel zero</div> }));
vi.mock('../../stock-ops/components/DeadStock', () => ({ default: () => <div>bottleneck</div> }));
vi.mock('../../stock-ops/components/MappingAttention', () => ({ default: () => <div>mapping attention</div> }));
vi.mock('./ChannelAvailability', () => ({ default: () => <div>availability evidence</div> }));
vi.mock('../../stock-ops/components/StockTransfers', () => ({ default: () => null }));
vi.mock('../../stock-ops/components/ReturnTransfers', () => ({ default: () => null }));
vi.mock('./StockAssets', () => ({ default: () => null }));

describe('inventory operation workspaces', () => {
  it('keeps freshness and operational summary in overview', () => {
    render(<InventoryOverviewWorkspace />);
    expect(screen.getByText('freshness')).toBeInTheDocument();
    expect(screen.getByText('summary')).toBeInTheDocument();
  });

  it('combines zero, bottleneck, mapping and channel evidence in attention', () => {
    render(<InventoryAttentionWorkspace />);
    for (const label of ['sellpia zero', 'channel zero', 'bottleneck', 'mapping attention', 'availability evidence']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: '매칭 확인 필요 SKU 검토' })).toHaveAttribute(
      'href',
      '/product-hub/matching?status=needs_review',
    );
  });
});
