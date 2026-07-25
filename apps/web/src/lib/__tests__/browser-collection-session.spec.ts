import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const RUN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_RUN_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const mockStart = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockDetectCoupang = vi.hoisted(() => vi.fn());
const mockDetectSourcing = vi.hoisted(() => vi.fn());
const mockDetectOrders = vi.hoisted(() => vi.fn());
const mockSend = vi.hoisted(() => vi.fn());

vi.mock('../operation-alerts', () => ({
  startOperationAlert: mockStart,
  updateOperationAlert: mockUpdate,
  requireAttentionOperationAlert: (
    operationKey: string,
    patch: Record<string, unknown>,
  ) => mockUpdate(operationKey, { ...patch, status: 'pending' }),
}));

vi.mock('../extension-bridge', () => ({
  detectExtensionId: mockDetectCoupang,
  detectSourcingExtensionId: mockDetectSourcing,
  detectOrderCollectionExtensionId: mockDetectOrders,
  detectBrowserCollectionExtensionIds: async () => {
    const ids = await Promise.all([
      mockDetectCoupang(),
      mockDetectSourcing(),
      mockDetectOrders(),
    ]);
    return [...new Set(ids.filter((id): id is string => Boolean(id)))];
  },
  sendToExtension: mockSend,
}));

import {
  browserCollectionOperationKey,
  browserCollectionRunIdFromOperationKey,
  findBrowserCollectionSession,
  listBrowserCollectionSessions,
  recordMissingBrowserCollection,
  sendBrowserCollectionControl,
  syncBrowserCollectionAlert,
} from '../browser-collection-session';

function session(
  overrides: Partial<BrowserCollectionSessionView> = {},
): BrowserCollectionSessionView {
  return {
    runId: RUN_ID,
    producer: 'dashboard.wing_sales',
    classification: 'background_preferred',
    status: 'running',
    attempt: 1,
    restartStrategy: 'web',
    progress: {
      current: 2,
      total: 4,
      completed: 1,
      failed: 0,
      label: 'Wing 매출 수집',
    },
    inputIdentity: { trigger: 'dashboard_traffic' },
    attention: null,
    startedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_001_000,
    finishedAt: null,
    ...overrides,
  };
}

describe('browser collection alert synchronization', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockStart.mockResolvedValue({ id: 'alert-1' });
    mockUpdate.mockResolvedValue({ id: 'alert-1' });
    mockDetectCoupang.mockResolvedValue('coupang-extension');
    mockDetectSourcing.mockResolvedValue('sourcing-extension');
    mockDetectOrders.mockResolvedValue('order-extension');
  });

  it('uses a run-scoped canonical operation key', () => {
    expect(browserCollectionOperationKey(RUN_ID)).toBe(
      `browser-collection:${RUN_ID}`,
    );
    expect(
      browserCollectionRunIdFromOperationKey(`browser-collection:${RUN_ID}`),
    ).toBe(RUN_ID);
    expect(
      browserCollectionRunIdFromOperationKey('browser-collection:not-a-run'),
    ).toBeNull();
  });

  it('starts one canonical personal alert when a session is running', async () => {
    await syncBrowserCollectionAlert(session());

    expect(mockStart).toHaveBeenCalledWith({
      operationKey: `browser-collection:${RUN_ID}`,
      type: 'browser_collection',
      title: 'dashboard.wing_sales',
      sourceType: 'browser_collection_session',
      sourceId: 'dashboard.wing_sales',
      href: '/',
      progress: 0.25,
      metadata: {
        browserCollection: true,
        runId: RUN_ID,
        producer: 'dashboard.wing_sales',
        collectionAttempt: 1,
        collectionUpdatedAt: 1_700_000_001_000,
        attentionReason: null,
      },
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('maps attention_required to one personal pending operation alert', async () => {
    mockUpdate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'alert-1' });
    const attentionSession = session({
      status: 'attention_required',
      attention: {
        reason: 'marketplace_login',
        message: 'Wing 로그인이 필요합니다.',
        canOpenTab: true,
      },
    });

    await syncBrowserCollectionAlert(attentionSession);

    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: `browser-collection:${RUN_ID}`,
        type: 'browser_collection',
        sourceType: 'browser_collection_session',
        sourceId: 'dashboard.wing_sales',
      }),
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      `browser-collection:${RUN_ID}`,
      expect.objectContaining({
        status: 'pending',
        severity: 'warning',
        message: 'Wing 로그인이 필요합니다.',
      }),
    );
  });

  it.each([
    ['succeeded', 'succeeded', 'info', 1],
    ['failed', 'failed', 'error', 0.25],
    ['cancelled', 'cancelled', 'info', 0.25],
  ] as const)(
    'maps terminal session %s to alert update %s',
    async (sessionStatus, alertStatus, severity, progress) => {
      await syncBrowserCollectionAlert(
        session({
          status: sessionStatus,
          finishedAt: 1_700_000_002_000,
        }),
      );

      expect(mockUpdate).toHaveBeenCalledWith(
        `browser-collection:${RUN_ID}`,
        expect.objectContaining({
          status: alertStatus,
          severity,
          progress,
        }),
      );
      expect(mockStart).not.toHaveBeenCalled();
    },
  );

  it('recovers a terminal event after reload by starting and then updating', async () => {
    mockUpdate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'alert-1' });

    await syncBrowserCollectionAlert(
      session({ status: 'succeeded', finishedAt: 1_700_000_002_000 }),
    );

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: `browser-collection:${RUN_ID}`,
        type: 'browser_collection',
        sourceType: 'browser_collection_session',
        sourceId: 'dashboard.wing_sales',
      }),
    );
    expect(mockUpdate).toHaveBeenLastCalledWith(
      `browser-collection:${RUN_ID}`,
      expect.objectContaining({ status: 'succeeded' }),
    );
  });

  it('keeps alert metadata free of managed tab and window identities', async () => {
    await syncBrowserCollectionAlert(session());

    const metadata = mockStart.mock.calls[0]?.[0]?.metadata;
    expect(metadata).not.toHaveProperty('tabId');
    expect(metadata).not.toHaveProperty('windowId');
    expect(metadata).not.toHaveProperty('_managedTabId');
    expect(metadata).not.toHaveProperty('_managedWindowId');
  });

  it('includes collection attempt and updatedAt ordering metadata on terminal updates', async () => {
    await syncBrowserCollectionAlert(
      session({
        status: 'succeeded',
        attempt: 3,
        updatedAt: 1_700_000_005_000,
        finishedAt: 1_700_000_005_000,
      }),
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      `browser-collection:${RUN_ID}`,
      expect.objectContaining({
        metadata: expect.objectContaining({
          collectionAttempt: 3,
          collectionUpdatedAt: 1_700_000_005_000,
        }),
      }),
    );
  });

  it('creates a canonical pending extension-missing alert without opening a tab', async () => {
    const randomUuid = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue(RUN_ID);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_004_000);

    const result = await recordMissingBrowserCollection(
      'dashboard.wing_sales',
      { trigger: 'dashboard_traffic' },
    );

    expect(result.runId).toBe(RUN_ID);
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: `browser-collection:${RUN_ID}`,
        type: 'browser_collection',
        sourceType: 'browser_collection_session',
        sourceId: 'dashboard.wing_sales',
      }),
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      `browser-collection:${RUN_ID}`,
      expect.objectContaining({
        status: 'pending',
        severity: 'warning',
        metadata: expect.objectContaining({
          collectionAttempt: 1,
          collectionUpdatedAt: 1_700_000_004_000,
          attentionReason: 'extension_missing',
          inputIdentity: { trigger: 'dashboard_traffic' },
        }),
      }),
    );
    expect(mockSend).not.toHaveBeenCalled();
    randomUuid.mockRestore();
    now.mockRestore();
  });

  it('keeps a route-generated run id when recording a missing extension', async () => {
    const runId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

    const result = await recordMissingBrowserCollection(
      'orders.mall',
      { mallKey: 'kidsnote' },
      runId,
    );

    expect(result).toEqual({ runId });
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: `browser-collection:${runId}`,
      }),
    );
  });

  it('rejects secret-bearing missing-extension identities before alert metadata leaves the browser', async () => {
    await expect(
      recordMissingBrowserCollection('dashboard.wing_sales', {
        accessToken: 'must-not-leave-browser',
      }),
    ).rejects.toThrow(/Secret identity field/);
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('browser collection extension lookup and controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectCoupang.mockResolvedValue('coupang-extension');
    mockDetectSourcing.mockResolvedValue('sourcing-extension');
    mockDetectOrders.mockResolvedValue('order-extension');
  });

  it('lists all three detected extensions in parallel and deduplicates by run ID', async () => {
    const newer = session({ updatedAt: 1_699_999_999_000, attempt: 2 });
    mockSend.mockImplementation(async (extensionId: string) => {
      if (extensionId === 'coupang-extension') return [session()];
      if (extensionId === 'sourcing-extension') return [newer];
      return [session({ runId: OTHER_RUN_ID, producer: 'orders.mall' })];
    });

    const sessions = await listBrowserCollectionSessions();

    expect(mockDetectCoupang).toHaveBeenCalledTimes(1);
    expect(mockDetectSourcing).toHaveBeenCalledTimes(1);
    expect(mockDetectOrders).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(mockSend).toHaveBeenCalledWith('coupang-extension', {
      action: 'listCollectionSessions',
    });
    expect(mockSend).toHaveBeenCalledWith('sourcing-extension', {
      action: 'listCollectionSessions',
    });
    expect(mockSend).toHaveBeenCalledWith('order-extension', {
      action: 'listCollectionSessions',
    });
    expect(sessions).toEqual([newer, expect.objectContaining({ runId: OTHER_RUN_ID })]);
  });

  it('finds a session by querying all detected extensions with the canonical command', async () => {
    mockSend.mockImplementation(async (extensionId: string) =>
      extensionId === 'sourcing-extension' ? session() : null,
    );

    await expect(findBrowserCollectionSession(RUN_ID)).resolves.toEqual(session());
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(mockSend).toHaveBeenCalledWith('coupang-extension', {
      action: 'getCollectionSession',
      runId: RUN_ID,
    });
    expect(mockSend).toHaveBeenCalledWith('sourcing-extension', {
      action: 'getCollectionSession',
      runId: RUN_ID,
    });
    expect(mockSend).toHaveBeenCalledWith('order-extension', {
      action: 'getCollectionSession',
      runId: RUN_ID,
    });
  });

  it('rejects malformed extension session responses at the web boundary', async () => {
    mockSend.mockResolvedValue({ runId: RUN_ID, status: 'running' });

    await expect(findBrowserCollectionSession(RUN_ID)).resolves.toBeNull();
  });

  it('ignores a valid extension session that does not match the requested run', async () => {
    mockSend.mockResolvedValue(session({ runId: OTHER_RUN_ID }));

    await expect(findBrowserCollectionSession(RUN_ID)).resolves.toBeNull();
  });

  it('sends an allowlisted control to all extensions and returns the valid owner response', async () => {
    const cancelled = session({
      status: 'cancelled',
      finishedAt: 1_700_000_002_000,
    });
    mockSend.mockImplementation(async (extensionId: string) =>
      extensionId === 'order-extension' ? cancelled : null,
    );

    await expect(
      sendBrowserCollectionControl(RUN_ID, 'cancelCollectionSession'),
    ).resolves.toEqual(cancelled);
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(mockSend).toHaveBeenCalledWith('order-extension', {
      action: 'cancelCollectionSession',
      runId: RUN_ID,
    });
  });

  it('re-reads the session when an older extension returns only a control result', async () => {
    const cancelled = session({
      status: 'cancelled',
      finishedAt: 1_700_000_002_000,
    });
    mockSend.mockImplementation(
      async (extensionId: string, command: { action: string }) => {
        if (extensionId !== 'coupang-extension') return null;
        if (command.action === 'cancelCollectionSession') {
          return { success: true, cancelled: true, runId: RUN_ID };
        }
        if (command.action === 'getCollectionSession') return cancelled;
        return null;
      },
    );

    await expect(
      sendBrowserCollectionControl(RUN_ID, 'cancelCollectionSession'),
    ).resolves.toEqual(cancelled);
    expect(mockSend).toHaveBeenCalledTimes(6);
    expect(mockSend).toHaveBeenCalledWith('coupang-extension', {
      action: 'getCollectionSession',
      runId: RUN_ID,
    });
  });

  it('re-reads the session when cancellation closes the response port', async () => {
    const cancelled = session({
      status: 'cancelled',
      finishedAt: 1_700_000_002_000,
    });
    mockSend.mockImplementation(
      async (extensionId: string, command: { action: string }) => {
        if (extensionId !== 'coupang-extension') return null;
        return command.action === 'getCollectionSession' ? cancelled : null;
      },
    );

    await expect(
      sendBrowserCollectionControl(RUN_ID, 'cancelCollectionSession'),
    ).resolves.toEqual(cancelled);
    expect(mockSend).toHaveBeenCalledTimes(6);
  });

  it('waits for the cancelled session when the first post-control read is still running', async () => {
    vi.useFakeTimers();
    const cancelled = session({
      status: 'cancelled',
      updatedAt: 1_700_000_002_000,
      finishedAt: 1_700_000_002_000,
    });
    let reads = 0;
    mockSend.mockImplementation(
      async (extensionId: string, command: { action: string }) => {
        if (extensionId !== 'coupang-extension') return null;
        if (command.action !== 'getCollectionSession') return null;
        reads += 1;
        return reads === 1 ? session() : cancelled;
      },
    );

    const result = sendBrowserCollectionControl(
      RUN_ID,
      'cancelCollectionSession',
    );
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual(cancelled);
    expect(reads).toBe(2);
  });

  it('rejects when the owner still reports a non-cancelled session after the confirmation window', async () => {
    vi.useFakeTimers();
    mockSend.mockImplementation(
      async (extensionId: string, command: { action: string }) => {
        if (extensionId !== 'coupang-extension') return null;
        if (command.action === 'getCollectionSession') return session();
        return null;
      },
    );

    const result = sendBrowserCollectionControl(
      RUN_ID,
      'cancelCollectionSession',
    );
    const rejection = expect(result).rejects.toThrow(
      /중단 상태를 확인하지 못했습니다/,
    );
    await vi.runAllTimersAsync();

    await rejection;
  });

  it('surfaces an explicit extension control failure without reporting stale state', async () => {
    mockSend.mockImplementation(async (extensionId: string) =>
      extensionId === 'coupang-extension'
        ? { success: false, error: 'cancel failed' }
        : null,
    );

    await expect(
      sendBrowserCollectionControl(RUN_ID, 'cancelCollectionSession'),
    ).rejects.toThrow('cancel failed');
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it('rejects commands outside the five shared collection controls', async () => {
    await expect(
      sendBrowserCollectionControl(
        RUN_ID,
        'focusCollectionTab' as 'cancelCollectionSession',
      ),
    ).rejects.toThrow();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
