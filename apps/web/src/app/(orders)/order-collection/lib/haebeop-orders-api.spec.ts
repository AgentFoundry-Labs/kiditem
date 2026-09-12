import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => bridge);

import { collectHaebeopOrdersFromExtension } from './haebeop-orders-api';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_TOKEN = '22222222-2222-4222-8222-222222222222';

describe('collectHaebeopOrdersFromExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.sendToExtension.mockResolvedValue({ success: true, orders: [] });
  });

  it('keeps the session active until browser file generation finalizes it', async () => {
    await collectHaebeopOrdersFromExtension(
      { date: '2026-07-31' },
      { attemptId: ATTEMPT_ID, attemptToken: ATTEMPT_TOKEN, extensionId: 'order-extension' },
    );

    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      expect.objectContaining({
        action: 'collectHaebeopOrders',
        attemptId: ATTEMPT_ID,
        deferTerminal: true,
      }),
      190000,
    );
  });
});
