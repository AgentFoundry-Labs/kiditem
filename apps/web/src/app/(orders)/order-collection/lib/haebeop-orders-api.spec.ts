import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
const browserCollectionSession = vi.hoisted(() => ({
  issueBrowserCollectionRunId: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => bridge);
vi.mock('@/lib/browser-collection-session', () => browserCollectionSession);

import { collectHaebeopOrdersFromExtension } from './haebeop-orders-api';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

describe('collectHaebeopOrdersFromExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserCollectionSession.issueBrowserCollectionRunId.mockImplementation(
      async (runId?: string) => runId ?? RUN_ID,
    );
    bridge.sendToExtension.mockResolvedValue({ success: true, orders: [] });
  });

  it('keeps the session active until browser file generation finalizes it', async () => {
    await collectHaebeopOrdersFromExtension(
      { date: '2026-07-31' },
      { runId: RUN_ID, extensionId: 'order-extension' },
    );

    expect(browserCollectionSession.issueBrowserCollectionRunId).toHaveBeenCalledWith(RUN_ID);
    expect(bridge.sendToExtension).toHaveBeenCalledWith(
      'order-extension',
      expect.objectContaining({
        action: 'collectHaebeopOrders',
        runId: RUN_ID,
        deferTerminal: true,
      }),
      190000,
    );
  });
});
