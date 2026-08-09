import { describe, expect, it, vi } from 'vitest';
import { SourcingAgentRagService } from '../sourcing-agent-rag.service';

describe('SourcingAgentRagService', () => {
  it('keys an index by requested days and current source snapshot fingerprint', async () => {
    const snapshots = {
      find: vi.fn(async () => null),
      listRecent: vi.fn(async () => []),
      upsert: vi.fn(async (input) => input),
    };
    const interests = { list: vi.fn(async () => []) };
    const service = new SourcingAgentRagService(snapshots as never, interests as never);

    await service.query({ organizationId: 'org-1', message: '관심 상품', days: 1 });
    await service.query({ organizationId: 'org-1', message: '관심 상품', days: 7 });

    const inputHashes = snapshots.find.mock.calls.map((call) => call[0].inputHash);
    expect(inputHashes).toHaveLength(2);
    expect(inputHashes[0]).not.toBe(inputHashes[1]);
    expect(snapshots.upsert).toHaveBeenCalledTimes(2);
  });
});
