import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getState: vi.fn(),
  listHistory: vi.fn(),
  claimDue: vi.fn(),
  heartbeat: vi.fn(),
  fail: vi.fn(),
  cancel: vi.fn(),
  importBrowser: vi.fn(),
  requestRefresh: vi.fn(),
  confirmSourceBinding: vi.fn(),
  importManual: vi.fn(),
}));
const extension = vi.hoisted(() => ({
  collectSellpiaInventory: vi.fn(),
  finalizeSellpiaInventorySession: vi.fn(),
  cancelSellpiaInventorySession: vi.fn(),
}));
const auth = vi.hoisted(() => ({ useAuth: vi.fn() }));
const alerts = vi.hoisted(() => ({
  startOperationAlert: vi.fn(),
  progressOperationAlert: vi.fn(),
  succeedOperationAlert: vi.fn(),
  failOperationAlert: vi.fn(),
  cancelOperationAlert: vi.fn(),
  requireAttentionOperationAlert: vi.fn(),
}));
const invalidateSellpiaInventory = vi.hoisted(() => vi.fn());
const sellpiaDrawerPropsMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/sellpia-inventory-freshness-api', () => ({ sellpiaInventoryFreshnessApi: api }));
vi.mock('@/lib/sellpia-inventory-extension', () => extension);
vi.mock('@/hooks/useAuth', () => auth);
vi.mock('@/lib/operation-alerts', () => alerts);
vi.mock('@/app/(inventory)/_shared/invalidate-sellpia-inventory', () => ({
  invalidateSellpiaInventory,
}));
vi.mock('@/components/sellpia-inventory', () => ({
  SellpiaFreshnessStatus: () => null,
  SellpiaFreshnessDrawer: (props: unknown) => {
    sellpiaDrawerPropsMock(props);
    return null;
  },
}));

import { SellpiaInventorySyncProvider } from '../SellpiaInventorySyncProvider';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const dueState = {
  status: 'refresh_required' as const,
  sourceBinding: { origin: 'https://kiditem.sellpia.com' as const, accountKey: 'kiditem' as const, confirmed: true as const },
  lastVerifiedAt: '2026-07-16T00:00:00.000Z',
  expiresAt: '2026-07-16T00:10:00.000Z',
  requestedGeneration: '2',
  verifiedGeneration: '1',
  refreshRequestedAt: '2026-07-16T00:11:00.000Z',
  refreshReason: 'ttl_expired' as const,
  syncNotBefore: null,
  activeSync: null,
  lastAttempt: null,
};
const claimed = {
  claimed: true as const,
  claimToken: RUN_ID,
  activeGeneration: '2',
  leaseExpiresAt: '2099-07-16T00:01:30.000Z',
  state: {
    ...dueState,
    status: 'syncing' as const,
    activeSync: {
      runId: RUN_ID,
      generation: '2',
      startedAt: '2026-07-16T00:00:00.000Z',
      leaseExpiresAt: '2099-07-16T00:01:30.000Z',
      canControl: true,
    },
  },
};

function renderProvider(children: React.ReactNode = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(
    <QueryClientProvider client={client}>
      <SellpiaInventorySyncProvider>{children}</SellpiaInventorySyncProvider>
    </QueryClientProvider>,
    ),
  };
}

describe('SellpiaInventorySyncProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.useAuth.mockReturnValue({ status: 'ready', user: { organizationId: 'org-1', role: 'owner' } });
    api.getState.mockResolvedValue(dueState);
    api.listHistory.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    api.claimDue.mockResolvedValue(claimed);
    api.heartbeat.mockResolvedValue(claimed.state);
    api.importBrowser.mockResolvedValue({
      run: { fileHash: 'a'.repeat(64), qualityReport: { issues: [] } },
    });
    extension.collectSellpiaInventory.mockResolvedValue({
      file: new File(['workbook'], 'inventory.xls'),
      extensionId: 'extension-id',
    });
    extension.finalizeSellpiaInventorySession.mockResolvedValue(undefined);
    extension.cancelSellpiaInventorySession.mockResolvedValue(undefined);
    invalidateSellpiaInventory.mockResolvedValue(undefined);
  });

  afterEach(() => vi.useRealTimers());

  it('does not claim before auth is ready or before syncNotBefore', async () => {
    auth.useAuth.mockReturnValueOnce({ status: 'loading', user: null });
    const first = renderProvider();
    expect(api.getState).not.toHaveBeenCalled();
    first.unmount();

    api.getState.mockResolvedValue({ ...dueState, syncNotBefore: '2099-07-16T00:00:00.000Z' });
    renderProvider();
    await waitFor(() => expect(api.getState).toHaveBeenCalled());
    expect(api.claimDue).not.toHaveBeenCalled();
  });

  it('waits for an explicit retry request instead of looping a failed generation', async () => {
    api.getState.mockResolvedValue({ ...dueState, status: 'failed' });

    renderProvider();
    await waitFor(() => expect(api.getState).toHaveBeenCalled());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(api.claimDue).not.toHaveBeenCalled();
  });

  it('claims once across two mounted coordinators and uses claimToken as the extension runId', async () => {
    renderProvider(<><SellpiaInventorySyncProvider /><SellpiaInventorySyncProvider /></>);
    await waitFor(() => expect(api.claimDue).toHaveBeenCalledTimes(1));
    expect(extension.collectSellpiaInventory).toHaveBeenCalledTimes(1);
    expect(extension.collectSellpiaInventory).toHaveBeenCalledWith({ runId: RUN_ID });
  });

  it('uses an ifAvailable organization Web Lock before the in-memory claim guard', async () => {
    let locked = false;
    const request = vi.fn(async (
      _name: string,
      _options: LockOptions,
      callback: (lock: Lock | null) => Promise<void>,
    ) => {
      if (locked) return callback(null);
      locked = true;
      try {
        return await callback({} as Lock);
      } finally {
        locked = false;
      }
    });
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request },
    });
    extension.collectSellpiaInventory.mockReturnValue(new Promise(() => undefined));

    renderProvider(<SellpiaInventorySyncProvider />);
    await waitFor(() => expect(request).toHaveBeenCalled());

    expect(request).toHaveBeenCalledWith(
      'kiditem:sellpia-inventory:org-1',
      { ifAvailable: true },
      expect.any(Function),
    );
    expect(api.claimDue).toHaveBeenCalledTimes(1);
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  });

  it('heartbeats every 20 seconds while the 90-second owner lease remains active', async () => {
    vi.useFakeTimers();
    extension.collectSellpiaInventory.mockReturnValue(new Promise(() => undefined));
    renderProvider();
    await vi.waitFor(() => expect(api.claimDue).toHaveBeenCalledTimes(1));

    await act(async () => vi.advanceTimersByTimeAsync(20_000));

    expect(api.heartbeat).toHaveBeenCalledWith(RUN_ID);
  });

  it('stops heartbeat on unmount without cancelling a reclaimable lease', async () => {
    vi.useFakeTimers();
    extension.collectSellpiaInventory.mockReturnValue(new Promise(() => undefined));
    const mounted = renderProvider();
    await vi.waitFor(() => expect(api.claimDue).toHaveBeenCalledTimes(1));
    mounted.unmount();
    await act(async () => vi.advanceTimersByTimeAsync(90_000));

    expect(api.cancel).not.toHaveBeenCalled();
    expect(extension.cancelSellpiaInventorySession).not.toHaveBeenCalled();
  });

  it('abandons a collector result after unmount so the lease can be reclaimed', async () => {
    let resolveCollection!: (value: { file: File; extensionId: string }) => void;
    extension.collectSellpiaInventory.mockReturnValue(new Promise((resolve) => {
      resolveCollection = resolve;
    }));
    const mounted = renderProvider();
    await waitFor(() => expect(api.claimDue).toHaveBeenCalledTimes(1));

    mounted.unmount();
    resolveCollection({
      file: new File(['workbook'], 'inventory.xls'),
      extensionId: 'extension-id',
    });
    await waitFor(() => expect(invalidateSellpiaInventory).toHaveBeenCalled());

    expect(api.importBrowser).not.toHaveBeenCalled();
    expect(api.cancel).not.toHaveBeenCalled();
    expect(extension.finalizeSellpiaInventorySession).not.toHaveBeenCalled();
  });

  it('abandons the owner lease on logout without cancelling or importing', async () => {
    let resolveCollection!: (value: { file: File; extensionId: string }) => void;
    extension.collectSellpiaInventory.mockReturnValue(new Promise((resolve) => {
      resolveCollection = resolve;
    }));
    const mounted = renderProvider();
    await waitFor(() => expect(api.claimDue).toHaveBeenCalledTimes(1));

    auth.useAuth.mockReturnValue({
      status: 'anonymous',
      user: { organizationId: 'org-1', role: 'owner' },
    });
    mounted.rerender(
      <QueryClientProvider client={mounted.client}>
        <SellpiaInventorySyncProvider />
      </QueryClientProvider>,
    );
    resolveCollection({
      file: new File(['workbook'], 'inventory.xls'),
      extensionId: 'extension-id',
    });
    await waitFor(() => expect(invalidateSellpiaInventory).toHaveBeenCalled());

    expect(api.importBrowser).not.toHaveBeenCalled();
    expect(api.cancel).not.toHaveBeenCalled();
    expect(extension.cancelSellpiaInventorySession).not.toHaveBeenCalled();
    expect(extension.finalizeSellpiaInventorySession).not.toHaveBeenCalled();
  });

  it('sends no heartbeat after the 90-second lease expires locally', async () => {
    vi.useFakeTimers();
    api.claimDue.mockResolvedValue({
      ...claimed,
      leaseExpiresAt: new Date(Date.now() + 90_000).toISOString(),
    });
    api.heartbeat.mockResolvedValue({ ...claimed.state, activeSync: null });
    extension.collectSellpiaInventory.mockReturnValue(new Promise(() => undefined));
    renderProvider();
    await vi.waitFor(() => expect(api.claimDue).toHaveBeenCalledTimes(1));

    await act(async () => vi.advanceTimersByTimeAsync(100_000));

    expect(api.heartbeat).toHaveBeenCalledTimes(4);
  });

  it('lets only the claiming provider explicitly cancel both the extension and server lease', async () => {
    extension.collectSellpiaInventory.mockReturnValue(new Promise(() => undefined));
    renderProvider();
    await waitFor(() => expect(sellpiaDrawerPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ ownerClaimToken: RUN_ID }),
    ));
    const props = sellpiaDrawerPropsMock.mock.lastCall?.[0] as {
      onCancel: (claimToken: string) => void;
    };

    await act(async () => props.onCancel(RUN_ID));

    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith(RUN_ID));
    expect(extension.cancelSellpiaInventorySession).toHaveBeenCalledWith({ runId: RUN_ID });
  });

  it('uploads, finalizes, invalidates projections, and deduplicates quality alerts by hash and warning code', async () => {
    api.importBrowser.mockResolvedValue({
      run: {
        fileHash: 'a'.repeat(64),
        qualityReport: { issues: [{ code: `${'a'.repeat(64)}:snapshot_churn`, severity: 'warning', count: 3 }] },
      },
    });

    renderProvider();

    await waitFor(() => expect(extension.finalizeSellpiaInventorySession).toHaveBeenCalledWith(
      { extensionId: 'extension-id', runId: RUN_ID },
      'succeeded',
      expect.any(String),
    ));
    expect(api.importBrowser).toHaveBeenCalledWith(expect.any(File), {
      claimToken: RUN_ID,
      activeGeneration: '2',
      trigger: 'ttl_expired',
    });
    expect(invalidateSellpiaInventory).toHaveBeenCalled();
    expect(alerts.startOperationAlert).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: `sellpia-inventory-quality:${'a'.repeat(64)}:snapshot_churn`,
    }));
    expect(alerts.requireAttentionOperationAlert).toHaveBeenCalledWith(
      `sellpia-inventory-quality:${'a'.repeat(64)}:snapshot_churn`,
      expect.objectContaining({ severity: 'warning' }),
    );
  });

  it('fails the server claim and extension session when upload fails', async () => {
    api.importBrowser.mockRejectedValue(new Error('upload failed'));

    renderProvider();

    await waitFor(() => expect(api.fail).toHaveBeenCalledWith(RUN_ID, expect.objectContaining({
      errorMessage: 'upload failed',
    })));
    expect(extension.finalizeSellpiaInventorySession).toHaveBeenCalledWith(
      { extensionId: 'extension-id', runId: RUN_ID },
      'failed',
      'upload failed',
    );
  });

  it('keeps the imported snapshot and reports an extension finalization failure', async () => {
    extension.finalizeSellpiaInventorySession.mockRejectedValue(new Error('port closed'));

    renderProvider();

    await waitFor(() => expect(alerts.failOperationAlert).toHaveBeenCalledWith(
      `browser-collection:${RUN_ID}`,
      expect.objectContaining({ severity: 'warning' }),
    ));
    expect(api.fail).not.toHaveBeenCalled();
    expect(invalidateSellpiaInventory).toHaveBeenCalled();
  });
});
