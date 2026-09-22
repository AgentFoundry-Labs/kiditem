import { describe, expect, it, vi } from 'vitest';
import { ThumbnailAnalysisRepositoryAdapter } from './thumbnail-analysis.repository.adapter';

describe('ThumbnailAnalysisRepositoryAdapter', () => {
  it('does not read AI content when Channels reports no eligible Coupang listings', async () => {
    const findMany = vi.fn();
    const readCatalogFacts = vi.fn().mockResolvedValue([]);
    const tx = { contentWorkspace: { findMany } };
    const repository = new ThumbnailAnalysisRepositoryAdapter({ $transaction: async (read: (value: unknown) => unknown) => read(tx) } as never, { readCatalogFacts } as never);
    expect(await repository.findAllAnalysisWorkspaces('org')).toEqual([]);
    expect(readCatalogFacts).toHaveBeenCalledWith(expect.anything(), { organizationId: 'org', channels: ['coupang'], activeOnly: true });
    expect(findMany).not.toHaveBeenCalled();
  });
});
