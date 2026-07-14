import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => bridge);

import {
  collectIcecreamMallRowsFromExtension,
  detectOrderCollectionSessionExtension,
  ensureMallLoggedInViaExtension,
} from './order-collection-extension';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

describe('order collection extension session bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.detectOrderCollectionExtensionId.mockResolvedValue('order-extension');
  });

  it('requires the browser collection session capability', async () => {
    await expect(detectOrderCollectionSessionExtension()).resolves.toBe(
      'order-extension',
    );
    expect(bridge.detectOrderCollectionExtensionId).toHaveBeenCalledWith(
      1200,
      'browserCollectionSessions',
    );
  });

  it('passes the page-owned runId into the automatic collection message', async () => {
    bridge.sendToExtension.mockResolvedValue({
      success: true,
      mall: '아이스크림몰',
      date: '2026-07-15',
      headers: ['주문번호'],
      rows: [['A-1']],
      rowCount: 1,
      masked: false,
      source: 'test',
      runId: RUN_ID,
    });

    await collectIcecreamMallRowsFromExtension(
      '2026-07-15',
      { loginId: 'operator', password: 'secret' },
      { runId: RUN_ID, extensionId: 'order-extension' },
    );

    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      expect.objectContaining({
        action: 'collectIcecreamMallOrders',
        runId: RUN_ID,
      }),
      90000,
    );
  });

  it('returns a structured login attention result instead of swallowing it', async () => {
    bridge.sendToExtension.mockResolvedValue({
      success: false,
      pendingLogin: true,
      error: '로그인이 필요합니다.',
    });

    const result = await ensureMallLoggedInViaExtension(
      'kidsnote',
      { loginId: 'operator', password: 'secret' },
      { runId: RUN_ID, extensionId: 'order-extension' },
    );

    expect(result).toEqual({
      success: false,
      pendingLogin: true,
      error: '로그인이 필요합니다.',
    });
    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      expect.objectContaining({ action: 'ensureMallLoggedIn', runId: RUN_ID }),
      45000,
    );
  });
});
