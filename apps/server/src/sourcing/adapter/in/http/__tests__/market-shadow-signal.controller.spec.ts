import { describe, expect, it, vi } from 'vitest';
import { MarketShadowSignalController } from '../market-shadow-signal.controller';

describe('MarketShadowSignalController', () => {
  it('collects only for the authenticated organization', async () => {
    const service = {
      collect: vi.fn(async () => ({ claimed: true, snapshot: { id: 'snapshot-1' } })),
      listRecent: vi.fn(),
    };
    const controller = new MarketShadowSignalController(service as never);

    const result = await controller.collect('org-1');

    expect(service.collect).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({ claimed: true, snapshot: { id: 'snapshot-1' } });
  });

  it('reads a bounded recent window for the authenticated organization', async () => {
    const service = {
      collect: vi.fn(),
      listRecent: vi.fn(async () => [{ id: 'snapshot-1' }]),
    };
    const controller = new MarketShadowSignalController(service as never);

    const result = await controller.listRecent({ days: 14 }, 'org-1');

    expect(service.listRecent).toHaveBeenCalledWith('org-1', 14);
    expect(result).toEqual({ snapshots: [{ id: 'snapshot-1' }] });
  });
});
