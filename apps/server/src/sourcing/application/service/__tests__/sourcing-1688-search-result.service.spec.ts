import { describe, expect, it, vi } from 'vitest';
import { Sourcing1688SearchResultService } from '../sourcing-1688-search-result.service';

describe('Sourcing1688SearchResultService', () => {
  it('maps the owner repository to a strict typed wire snapshot', async () => {
    const repository = {
      findLatest: vi.fn(async () => ({
        generatedAt: new Date('2026-08-14T00:01:00.000Z'),
        observations: [{
          keyword: '儿童雨伞',
          targetId: null,
          capturedAt: new Date('2026-08-14T00:00:00.000Z'),
          items: [],
        }],
      })),
    };
    const service = new Sourcing1688SearchResultService(repository as never);

    await expect(service.latest({
      organizationId: 'org-1',
      keywords: [' 儿童雨伞 '],
      targetIds: [],
    })).resolves.toEqual({
      generatedAt: '2026-08-14T00:01:00.000Z',
      observations: [{
        keyword: '儿童雨伞',
        targetId: null,
        capturedAt: '2026-08-14T00:00:00.000Z',
        items: [],
      }],
    });
    expect(repository.findLatest).toHaveBeenCalledWith({
      organizationId: 'org-1',
      keywords: ['儿童雨伞'],
      targetIds: undefined,
    });
  });
});
