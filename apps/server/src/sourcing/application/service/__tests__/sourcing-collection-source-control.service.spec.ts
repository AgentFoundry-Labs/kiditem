import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SourcingCollectionSourceControlService } from '../sourcing-collection-source-control.service';

describe('SourcingCollectionSourceControlService', () => {
  it('defaults every allowlisted source to enabled until an organization overrides it', async () => {
    const repository = { findBySourceKeys: vi.fn(async () => []), setEnabled: vi.fn() };
    const service = new SourcingCollectionSourceControlService(repository as never);

    await expect(service.list('org-1')).resolves.toContainEqual(
      expect.objectContaining({ sourceKey: '1688.hot_product', enabled: true, updatedAt: null }),
    );
  });

  it('persists only an allowlisted source override', async () => {
    const repository = {
      findBySourceKeys: vi.fn(),
      setEnabled: vi.fn(async (input) => ({ ...input, updatedAt: new Date() })),
    };
    const service = new SourcingCollectionSourceControlService(repository as never);

    await expect(service.setEnabled({
      organizationId: 'org-1', sourceKey: '1688.hot_product', enabled: false,
    })).resolves.toMatchObject({ enabled: false });
    await expect(service.setEnabled({
      organizationId: 'org-1', sourceKey: 'untrusted.fetch', enabled: true,
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
