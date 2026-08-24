import { describe, expect, it } from 'vitest';
import { AttemptProcessRegistry } from './attempt-process.registry';

describe('AttemptProcessRegistry', () => {
  it('owns one live process per Attempt and terminates the complete tree once', async () => {
    let terminated = 0;
    const registry = new AttemptProcessRegistry();
    registry.register('33333333-3333-4333-8333-333333333333', { terminate: async () => { terminated += 1; }, input: async () => undefined, onExit: () => undefined });
    await registry.interrupt('33333333-3333-4333-8333-333333333333');
    await registry.interrupt('33333333-3333-4333-8333-333333333333');
    expect(terminated).toBe(1);
  });
});
