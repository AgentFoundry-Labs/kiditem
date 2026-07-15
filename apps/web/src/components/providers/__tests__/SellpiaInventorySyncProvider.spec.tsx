import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

const api = vi.hoisted(() => ({
  getState: vi.fn(),
  getCurrentBasis: vi.fn(),
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

import * as providerModule from '../SellpiaInventorySyncProvider';

const { SellpiaInventorySyncProvider } = providerModule;

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const NEW_ORGANIZATION_RUN_ID = '22222222-2222-4222-8222-222222222222';
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
const IMPORT_RUN_ID = '33333333-3333-4333-8333-333333333333';

function completedImport(issues: Array<{
  code: string;
  severity: 'warning' | 'error';
  count: number;
  sampleRowNumbers: number[];
  sampleProductCodes: string[];
}> = []) {
  return {
    run: {
      id: IMPORT_RUN_ID,
      sourceType: 'sellpia_inventory' as const,
      channelAccountId: null,
      fileName: 'inventory.xls',
      fileHash: 'a'.repeat(64),
      status: 'completed' as const,
      rowCount: 42,
      importedAt: '2026-07-16T00:02:00.000Z',
      lastVerifiedAt: '2026-07-16T00:02:00.000Z',
      verificationCount: 1,
      lastTrigger: 'ttl_expired' as const,
      freshnessGeneration: '2',
      manualFreshExportConfirmedAt: null,
      manualFreshExportConfirmedBy: null,
      qualityReport: { issues },
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-07-16T00:02:00.000Z',
      updatedAt: '2026-07-16T00:02:00.000Z',
    },
    duplicate: false,
    outcome: 'published' as const,
    changes: {
      createdMasterProductCount: 1,
      updatedMasterProductCount: 41,
      inactivatedMasterProductCount: 0,
    },
  };
}

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

function expectNoStaleClaimSideEffects() {
  expect(api.heartbeat).not.toHaveBeenCalled();
  expect(extension.collectSellpiaInventory).not.toHaveBeenCalled();
  expect(api.importBrowser).not.toHaveBeenCalled();
  expect(extension.finalizeSellpiaInventorySession).not.toHaveBeenCalled();
  expect(extension.cancelSellpiaInventorySession).not.toHaveBeenCalled();
  expect(api.cancel).not.toHaveBeenCalled();
  expect(api.fail).not.toHaveBeenCalled();
  expect(alerts.startOperationAlert).not.toHaveBeenCalled();
}

describe('SellpiaInventorySyncProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.useAuth.mockReturnValue({ status: 'ready', user: { organizationId: 'org-1', role: 'owner' } });
    api.getState.mockResolvedValue(dueState);
    api.getCurrentBasis.mockResolvedValue(null);
    api.listHistory.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    api.claimDue.mockResolvedValue(claimed);
    api.heartbeat.mockResolvedValue(claimed.state);
    api.fail.mockResolvedValue(dueState);
    api.cancel.mockResolvedValue(dueState);
    api.importBrowser.mockResolvedValue(completedImport());
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

  it('abandons a delayed claim response after logout without stale follow-on side effects', async () => {
    let resolveClaim!: (value: typeof claimed) => void;
    api.claimDue.mockReturnValueOnce(new Promise((resolve) => {
      resolveClaim = resolve;
    }));
    const mounted = renderProvider();
    await waitFor(() => expect(api.claimDue).toHaveBeenCalledTimes(1));

    auth.useAuth.mockReturnValue({ status: 'anonymous', user: null });
    mounted.rerender(
      <QueryClientProvider client={mounted.client}>
        <SellpiaInventorySyncProvider />
      </QueryClientProvider>,
    );
    await act(async () => {
      resolveClaim(claimed);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expectNoStaleClaimSideEffects();
  });

  it('abandons an old-organization delayed claim while the new organization claim remains pending', async () => {
    let resolveOldClaim!: (value: typeof claimed) => void;
    api.claimDue
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveOldClaim = resolve;
      }))
      .mockReturnValueOnce(new Promise(() => undefined));
    const mounted = renderProvider();
    await waitFor(() => expect(api.claimDue).toHaveBeenCalledTimes(1));

    auth.useAuth.mockReturnValue({
      status: 'ready',
      user: { organizationId: 'org-2', role: 'owner' },
    });
    mounted.rerender(
      <QueryClientProvider client={mounted.client}>
        <SellpiaInventorySyncProvider />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(api.claimDue).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveOldClaim(claimed);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expectNoStaleClaimSideEffects();
  });

  it('uses the new organization extension ID when the stale collector resolves last', async () => {
    const newOrganizationClaim = {
      ...claimed,
      claimToken: NEW_ORGANIZATION_RUN_ID,
      state: {
        ...claimed.state,
        activeSync: {
          ...claimed.state.activeSync,
          runId: NEW_ORGANIZATION_RUN_ID,
        },
      },
    };
    let resolveOldCollection!: (value: { file: File; extensionId: string }) => void;
    let resolveNewCollection!: (value: { file: File; extensionId: string }) => void;
    api.claimDue
      .mockResolvedValueOnce(claimed)
      .mockResolvedValueOnce(newOrganizationClaim);
    extension.collectSellpiaInventory
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveOldCollection = resolve;
      }))
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveNewCollection = resolve;
      }));
    api.importBrowser.mockReturnValueOnce(new Promise(() => undefined));
    const mounted = renderProvider();
    await waitFor(() => expect(extension.collectSellpiaInventory).toHaveBeenCalledWith({
      runId: RUN_ID,
    }));

    auth.useAuth.mockReturnValue({
      status: 'ready',
      user: { organizationId: 'org-2', role: 'owner' },
    });
    mounted.rerender(
      <QueryClientProvider client={mounted.client}>
        <SellpiaInventorySyncProvider />
      </QueryClientProvider>,
    );
    await act(async () => {
      mounted.client.setQueryData(queryKeys.inventory.freshness(), dueState);
    });
    await waitFor(() => expect(extension.collectSellpiaInventory).toHaveBeenCalledWith({
      runId: NEW_ORGANIZATION_RUN_ID,
    }));

    await act(async () => resolveNewCollection({
      file: new File(['new-workbook'], 'new-inventory.xls'),
      extensionId: 'new-organization-extension',
    }));
    await waitFor(() => expect(api.importBrowser).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ claimToken: NEW_ORGANIZATION_RUN_ID }),
    ));
    await act(async () => resolveOldCollection({
      file: new File(['old-workbook'], 'old-inventory.xls'),
      extensionId: 'old-organization-extension',
    }));
    await waitFor(() => expect(sellpiaDrawerPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ ownerClaimToken: NEW_ORGANIZATION_RUN_ID }),
    ));
    const props = sellpiaDrawerPropsMock.mock.lastCall?.[0] as {
      onCancel: (claimToken: string) => void;
    };

    await act(async () => props.onCancel(NEW_ORGANIZATION_RUN_ID));

    await waitFor(() => expect(extension.cancelSellpiaInventorySession).toHaveBeenCalledWith({
      extensionId: 'new-organization-extension',
      runId: NEW_ORGANIZATION_RUN_ID,
    }));
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

  it('uses the complete local lock name as the in-memory deduplication identity', () => {
    const lockName = (providerModule as typeof providerModule & {
      sellpiaInventoryLockName?: (organizationId: string) => string;
    }).sellpiaInventoryLockName;

    expect(typeof lockName).toBe('function');
    if (!lockName) return;
    expect(lockName('org-1')).toBe('kiditem:sellpia-inventory:org-1');
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

  it('abandons after delayed alert progress before starting the upload', async () => {
    let resolveProgress!: () => void;
    alerts.progressOperationAlert.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveProgress = resolve;
    }));
    const mounted = renderProvider();
    await waitFor(() => expect(alerts.progressOperationAlert).toHaveBeenCalled());

    mounted.unmount();
    await act(async () => resolveProgress());
    await waitFor(() => expect(invalidateSellpiaInventory).toHaveBeenCalled());

    expect(api.importBrowser).not.toHaveBeenCalled();
    expect(extension.finalizeSellpiaInventorySession).not.toHaveBeenCalled();
  });

  it('abandons after a delayed upload without finalizing or publishing quality alerts', async () => {
    let resolveUpload!: (value: ReturnType<typeof completedImport>) => void;
    api.importBrowser.mockReturnValueOnce(new Promise((resolve) => {
      resolveUpload = resolve;
    }));
    const mounted = renderProvider();
    await waitFor(() => expect(api.importBrowser).toHaveBeenCalled());

    mounted.unmount();
    await act(async () => resolveUpload(completedImport([{
      code: 'snapshot_churn',
      severity: 'warning',
      count: 3,
      sampleRowNumbers: [2],
      sampleProductCodes: ['SKU-1'],
    }])));
    await waitFor(() => expect(invalidateSellpiaInventory).toHaveBeenCalled());

    expect(extension.finalizeSellpiaInventorySession).not.toHaveBeenCalled();
    expect(alerts.requireAttentionOperationAlert).not.toHaveBeenCalled();
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

  it('retries a transient claim failure on the next successful freshness poll', async () => {
    api.claimDue
      .mockRejectedValueOnce(new Error('temporary claim failure'))
      .mockResolvedValueOnce({ claimed: false, state: dueState });
    const mounted = renderProvider();
    await waitFor(() => expect(api.claimDue).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 5));

    await act(async () => {
      await mounted.client.refetchQueries({
        queryKey: queryKeys.inventory.freshness(),
      });
    });

    await waitFor(() => expect(api.claimDue).toHaveBeenCalledTimes(2));
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
    expect(alerts.cancelOperationAlert).toHaveBeenCalledWith(
      `browser-collection:${RUN_ID}`,
      expect.objectContaining({
        metadata: expect.objectContaining({
          browserCollection: true,
          collectionAttempt: 1,
          collectionUpdatedAt: expect.any(Number),
        }),
      }),
    );
  });

  it('uploads, finalizes, invalidates projections, and deduplicates quality alerts by hash and warning code', async () => {
    api.importBrowser.mockResolvedValue(completedImport([{
      code: `${'a'.repeat(64)}:snapshot_churn`,
      severity: 'warning',
      count: 3,
      sampleRowNumbers: [2],
      sampleProductCodes: ['SKU-1'],
    }]));

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
      operationKey: `browser-collection:${RUN_ID}`,
      type: 'browser_collection',
      sourceType: 'browser_collection_session',
      sourceId: 'inventory.sellpia',
      href: '/inventory-hub?tab=overview',
      metadata: expect.objectContaining({
        browserCollection: true,
        collectionAttempt: 1,
        collectionUpdatedAt: expect.any(Number),
        claimToken: RUN_ID,
        generation: '2',
      }),
    }));
    expect(alerts.startOperationAlert).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: `sellpia-inventory-quality:${'a'.repeat(64)}:snapshot_churn`,
      type: 'sellpia_inventory_quality',
      sourceType: 'sellpia_inventory_import',
      sourceId: IMPORT_RUN_ID,
      href: '/inventory-hub?tab=overview',
      metadata: expect.objectContaining({
        browserCollection: true,
        collectionAttempt: 1,
        collectionUpdatedAt: expect.any(Number),
        fileHash: 'a'.repeat(64),
        warningCode: 'snapshot_churn',
      }),
    }));
    expect(alerts.progressOperationAlert).toHaveBeenCalledWith(
      `browser-collection:${RUN_ID}`,
      expect.objectContaining({
        metadata: expect.objectContaining({
          browserCollection: true,
          collectionAttempt: 1,
          collectionUpdatedAt: expect.any(Number),
        }),
      }),
    );
    expect(alerts.succeedOperationAlert).toHaveBeenCalledWith(
      `browser-collection:${RUN_ID}`,
      expect.objectContaining({
        metadata: expect.objectContaining({
          browserCollection: true,
          collectionAttempt: 1,
          collectionUpdatedAt: expect.any(Number),
        }),
      }),
    );
    expect(alerts.requireAttentionOperationAlert).toHaveBeenCalledWith(
      `sellpia-inventory-quality:${'a'.repeat(64)}:snapshot_churn`,
      expect.objectContaining({
        severity: 'warning',
        metadata: expect.objectContaining({
          browserCollection: true,
          collectionAttempt: 1,
          collectionUpdatedAt: expect.any(Number),
          fileHash: 'a'.repeat(64),
          warningCode: 'snapshot_churn',
        }),
      }),
    );
    const automaticStart = alerts.startOperationAlert.mock.calls.find(
      ([input]) => input.operationKey === `browser-collection:${RUN_ID}`,
    )?.[0];
    const qualityStart = alerts.startOperationAlert.mock.calls.find(
      ([input]) => input.operationKey.startsWith('sellpia-inventory-quality:'),
    )?.[0];
    const progressMetadata = alerts.progressOperationAlert.mock.calls[0]?.[1]?.metadata;
    const successMetadata = alerts.succeedOperationAlert.mock.calls[0]?.[1]?.metadata;
    const qualityAttentionMetadata =
      alerts.requireAttentionOperationAlert.mock.calls[0]?.[1]?.metadata;
    expect(progressMetadata.collectionUpdatedAt).toBeGreaterThan(
      automaticStart.metadata.collectionUpdatedAt,
    );
    expect(successMetadata.collectionUpdatedAt).toBeGreaterThan(
      progressMetadata.collectionUpdatedAt,
    );
    expect(qualityAttentionMetadata.collectionUpdatedAt).toBeGreaterThan(
      qualityStart.metadata.collectionUpdatedAt,
    );
  });

  it('continues inventory upload and finalization when alert progress transport fails', async () => {
    alerts.progressOperationAlert.mockRejectedValueOnce(
      new Error('alert transport unavailable'),
    );

    renderProvider();

    await waitFor(() => expect(api.importBrowser).toHaveBeenCalled());
    await waitFor(() => expect(extension.finalizeSellpiaInventorySession).toHaveBeenCalled());
    expect(api.fail).not.toHaveBeenCalled();
  });

  it('does not fail a completed inventory import when quality alert transport fails', async () => {
    api.importBrowser.mockResolvedValue(completedImport([{
      code: 'snapshot_churn',
      severity: 'warning',
      count: 3,
      sampleRowNumbers: [2],
      sampleProductCodes: ['SKU-1'],
    }]));
    alerts.requireAttentionOperationAlert.mockRejectedValueOnce(
      new Error('quality alert transport unavailable'),
    );

    renderProvider();

    await waitFor(() => expect(alerts.requireAttentionOperationAlert).toHaveBeenCalled());
    await waitFor(() => expect(invalidateSellpiaInventory).toHaveBeenCalled());
    expect(extension.finalizeSellpiaInventorySession).toHaveBeenCalled();
    expect(api.fail).not.toHaveBeenCalled();
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
    expect(alerts.failOperationAlert).toHaveBeenCalledWith(
      `browser-collection:${RUN_ID}`,
      expect.objectContaining({
        metadata: expect.objectContaining({
          browserCollection: true,
          collectionAttempt: 1,
          collectionUpdatedAt: expect.any(Number),
        }),
      }),
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
