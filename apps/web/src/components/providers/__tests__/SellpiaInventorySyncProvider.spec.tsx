import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ useAuth: vi.fn() }));
const freshness = vi.hoisted(() => ({ useSellpiaInventoryFreshness: vi.fn() }));

vi.mock('@/hooks/useAuth', () => auth);
vi.mock('@/hooks/useSellpiaInventoryFreshness', () => freshness);

import { SellpiaInventorySyncProvider } from '../SellpiaInventorySyncProvider';

describe('SellpiaInventorySyncProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a freshness projection and renders children without claiming browser work', () => {
    auth.useAuth.mockReturnValue({ status: 'ready', user: { organizationId: 'org-1' } });
    freshness.useSellpiaInventoryFreshness.mockReturnValue({ state: null });

    render(<SellpiaInventorySyncProvider><div>provider child</div></SellpiaInventorySyncProvider>);

    expect(screen.getByText('provider child')).toBeInTheDocument();
    expect(freshness.useSellpiaInventoryFreshness).toHaveBeenCalledWith({ enabled: true });
  });

  it('does not load a projection until authentication has an organization', () => {
    auth.useAuth.mockReturnValue({ status: 'loading', user: null });
    freshness.useSellpiaInventoryFreshness.mockReturnValue({ state: null });

    render(<SellpiaInventorySyncProvider />);

    expect(freshness.useSellpiaInventoryFreshness).toHaveBeenCalledWith({ enabled: false });
  });
});
