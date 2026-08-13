import { describe, expect, it, vi } from 'vitest';
import { SourcingKeywordPreferenceService } from '../sourcing-keyword-preference.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

describe('SourcingKeywordPreferenceService', () => {
  it('normalizes the path keyword and rejects a stale compare-and-swap write', async () => {
    const repository = {
      list: vi.fn(),
      save: vi.fn(async () => ({ kind: 'version_conflict', currentVersion: 3 })),
    };
    const service = new SourcingKeywordPreferenceService(repository as never);

    await expect(service.save({
      organizationId: ORGANIZATION_ID,
      keyword: '  유아   우산 ',
      excluded: true,
      expectedVersion: 2,
    })).rejects.toMatchObject({ status: 409 });
    expect(repository.save).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      keywordNormalized: '유아우산',
      displayKeyword: '유아 우산',
      excluded: true,
      expectedVersion: 2,
    });
  });
});
