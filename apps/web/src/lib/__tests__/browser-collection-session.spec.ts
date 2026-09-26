import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ATTEMPT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_ATTEMPT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const mockDetectCoupang = vi.hoisted(() => vi.fn());
const mockDetectSourcing = vi.hoisted(() => vi.fn());
const mockDetectOrders = vi.hoisted(() => vi.fn());
const mockSend = vi.hoisted(() => vi.fn());

vi.mock('../extension-bridge', () => ({
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
  findBrowserCollectionSession,
  listBrowserCollectionSessions,
  preferBrowserCollectionSession,
  sendBrowserCollectionControl,
} from '../browser-collection-session';

function session(
  overrides: Partial<BrowserCollectionSessionView> = {},
): BrowserCollectionSessionView {
  return {
    attemptId: ATTEMPT_ID,
    producer: 'advertising.ad_keyword',
    progress: {
      current: 2,
      total: 4,
      completed: 1,
      failed: 0,
      label: 'Wing 매출 수집',
    },
    attention: null,
    ...overrides,
  };
}

describe('browser collection session transport adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectCoupang.mockResolvedValue('coupang-extension');
    mockDetectSourcing.mockResolvedValue('sourcing-extension');
    mockDetectOrders.mockResolvedValue('order-extension');
  });

  it('lists strict owner sessions and deduplicates by attempt ID', async () => {
    const newerProgress = session({
      progress: {
        current: 3,
        total: 4,
        completed: 2,
        failed: 0,
        label: 'Wing 매출 수집',
      },
    });
    mockSend.mockImplementation(async (extensionId: string) => {
      if (extensionId === 'coupang-extension') return [session()];
      if (extensionId === 'sourcing-extension') return [newerProgress];
      return [session({ attemptId: OTHER_ATTEMPT_ID, producer: 'orders.mall' })];
    });

    await expect(listBrowserCollectionSessions()).resolves.toEqual([
      newerProgress,
      session({ attemptId: OTHER_ATTEMPT_ID, producer: 'orders.mall' }),
    ]);
    expect(mockDetectCoupang).toHaveBeenCalledOnce();
    expect(mockDetectSourcing).toHaveBeenCalledOnce();
    expect(mockDetectOrders).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledWith('coupang-extension', {
      action: 'listCollectionSessions',
    });
  });

  it('finds a strict session with the owner attempt identity', async () => {
    mockSend.mockImplementation(async (extensionId: string, command: { action: string }) =>
      extensionId === 'sourcing-extension' && command.action === 'getCollectionSession'
        ? session()
        : null);

    await expect(findBrowserCollectionSession(ATTEMPT_ID)).resolves.toEqual(session());
    expect(mockSend).toHaveBeenCalledWith('sourcing-extension', {
      action: 'getCollectionSession',
      attemptId: ATTEMPT_ID,
    });
  });

  it('rejects the retired runId/status response shape at the web boundary', async () => {
    mockSend.mockResolvedValue({ runId: ATTEMPT_ID, status: 'running' });

    await expect(findBrowserCollectionSession(ATTEMPT_ID)).resolves.toBeNull();
  });

  it('ignores a valid session belonging to another owner attempt', async () => {
    mockSend.mockResolvedValue(session({ attemptId: OTHER_ATTEMPT_ID }));

    await expect(findBrowserCollectionSession(ATTEMPT_ID)).resolves.toBeNull();
  });

  it('sends only strict allowlisted controls with attemptId', async () => {
    const attention = session({
      attention: {
        reason: 'marketplace_login',
        message: 'Wing 로그인이 필요합니다.',
        canOpenTab: true,
      },
    });
    mockSend.mockImplementation(async (extensionId: string, command: { action: string }) =>
      extensionId === 'order-extension' && command.action === 'openCollectionAttentionTab'
        ? attention
        : null);

    await expect(
      sendBrowserCollectionControl(ATTEMPT_ID, 'openCollectionAttentionTab'),
    ).resolves.toEqual(attention);
    expect(mockSend).toHaveBeenCalledWith('order-extension', {
      action: 'openCollectionAttentionTab',
      attemptId: ATTEMPT_ID,
    });
  });

  it('returns the owner session after cancellation without inventing a terminal status', async () => {
    mockSend.mockImplementation(async (extensionId: string, command: { action: string }) =>
      extensionId === 'order-extension' && command.action === 'cancelCollectionSession'
        ? session({ progress: { current: 2, total: 4, completed: 1, failed: 0, label: 'Wing 매출 수집' } })
        : null);

    await expect(
      sendBrowserCollectionControl(ATTEMPT_ID, 'cancelCollectionSession'),
    ).resolves.toEqual(session());
    expect(mockSend).toHaveBeenCalledWith('order-extension', {
      action: 'cancelCollectionSession',
      attemptId: ATTEMPT_ID,
    });
  });

  it('surfaces an explicit extension control failure', async () => {
    mockSend.mockImplementation(async (extensionId: string) =>
      extensionId === 'coupang-extension'
        ? { success: false, error: 'cancel failed' }
        : null);

    await expect(
      sendBrowserCollectionControl(ATTEMPT_ID, 'cancelCollectionSession'),
    ).rejects.toThrow('cancel failed');
  });

  it('rejects commands outside the strict session control contract', async () => {
    await expect(
      sendBrowserCollectionControl(
        ATTEMPT_ID,
        'focusCollectionTab' as 'cancelCollectionSession',
      ),
    ).rejects.toThrow();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('accepts the latest event as delivered without comparing invented revisions', () => {
    const current = session();
    const attention = session({
      attention: {
        reason: 'marketplace_login',
        message: '로그인이 필요합니다.',
        canOpenTab: true,
      },
    });

    expect(preferBrowserCollectionSession(current, attention)).toEqual(attention);
    expect(preferBrowserCollectionSession(attention, current)).toEqual(current);
    expect(preferBrowserCollectionSession(current, null)).toEqual(current);
  });
});
