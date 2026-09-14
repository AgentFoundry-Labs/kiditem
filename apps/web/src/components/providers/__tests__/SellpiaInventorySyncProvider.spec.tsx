import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SellpiaInventorySyncProvider } from '../SellpiaInventorySyncProvider';

const auth = vi.hoisted(() => ({ useAuth: vi.fn() }));
const sourceOwner = vi.hoisted(() => ({ useSellpiaInventoryCollection: vi.fn() }));

vi.mock('@/hooks/useAuth', () => auth);
vi.mock('@/app/(inventory)/_shared/sellpia-inventory-source-owner', () => sourceOwner);

describe('SellpiaInventorySyncProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a freshness projection and renders children without claiming browser work', () => {
    auth.useAuth.mockReturnValue({ status: 'ready', user: { organizationId: 'org-1' } });
    sourceOwner.useSellpiaInventoryCollection.mockReturnValue({ state: null });

    render(<SellpiaInventorySyncProvider><div>provider child</div></SellpiaInventorySyncProvider>);

    expect(screen.getByText('provider child')).toBeInTheDocument();
    expect(sourceOwner.useSellpiaInventoryCollection).toHaveBeenCalledWith({ enabled: true });
  });

  it('does not load a projection until authentication has an organization', () => {
    auth.useAuth.mockReturnValue({ status: 'loading', user: null });
    sourceOwner.useSellpiaInventoryCollection.mockReturnValue({ state: null });

    render(<SellpiaInventorySyncProvider />);

    expect(sourceOwner.useSellpiaInventoryCollection).toHaveBeenCalledWith({ enabled: false });
  });
});
