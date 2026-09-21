import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { startCollectionSource } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectSellpiaInventoryBeforeCalculation } from './collect-sellpia-before-calculation';

const statusQuery = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-collection-source-control', () => ({ startCollectionSource: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('./sellpia-inventory-source-owner', async (original) => ({
  ...await original<typeof import('./sellpia-inventory-source-owner')>(),
  sellpiaInventoryCollection: () => ({
    sourceKey: 'inventory.sellpia',
    statusQuery: { queryKey: ['source'], queryFn: statusQuery },
  }),
}));
const id = '11111111-1111-4111-8111-111111111111';
function attempt(state: 'RUNNING' | 'COMPLETE' | 'FAILED') {
  return {
    attemptId: id, attemptToken: id, generation: '1', state,
    plan: { sourceType: 'sellpia_inventory', parserVersion: 'sellpia-inventory-v1',
      scope: 'inventory', trigger: 'manual_request', sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem', generation: '1' },
    expiresAt: '2099-01-01T00:00:00.000Z', actualCutoffAt: null, fileName: null,
    fileHash: null, contentChecksum: null, rowCount: 0, errorCode: null,
    errorMessage: state === 'FAILED' ? '수집 중단' : null,
  };
}
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  statusQuery.mockReset().mockResolvedValue({ activeSync: null, lastCompletedAttemptId: null, lastAttemptId: null });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(startCollectionSource).mockResolvedValue({ outcome: 'started', attemptId: id });
});
afterEach(() => client.clear());
describe('collect before calculation', () => {
  it('waits for the started attempt to commit instead of returning on handoff', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(attempt('RUNNING')).mockResolvedValue(attempt('COMPLETE'));
    const completed = await collectSellpiaInventoryBeforeCalculation(client, id);
    expect(completed).toBe(id);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });
  it('joins an existing attempt and rejects its failure without starting another', async () => {
    vi.mocked(startCollectionSource).mockResolvedValue({ outcome: 'running', attemptId: id });
    vi.mocked(apiClient.get).mockResolvedValue(attempt('FAILED'));
    await expect(collectSellpiaInventoryBeforeCalculation(client, id)).rejects.toThrow('수집 중단');
    expect(startCollectionSource).toHaveBeenCalledTimes(1);
  });
  it('detects a failed shared start whose identity arrives after the start response', async () => {
    vi.mocked(startCollectionSource).mockResolvedValue({ outcome: 'running', attemptId: null });
    statusQuery.mockResolvedValueOnce({ activeSync: null, lastCompletedAttemptId: null, lastAttemptId: null })
      .mockResolvedValue({ activeSync: null, lastCompletedAttemptId: null, lastAttemptId: id });
    vi.mocked(apiClient.get).mockResolvedValue(attempt('FAILED'));
    await expect(collectSellpiaInventoryBeforeCalculation(client, id)).rejects.toThrow('수집 중단');
  });
  it('stops waiting on navigation without cancelling the shared collection', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(attempt('RUNNING'));
    const controller = new AbortController();
    const result = collectSellpiaInventoryBeforeCalculation(client, id, controller.signal);
    await vi.waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    controller.abort(new Error('navigation'));
    await expect(result).rejects.toThrow('navigation');
    expect(startCollectionSource).toHaveBeenCalledTimes(1);
  });
});
