import { describe, expect, it, vi } from 'vitest';
import { DetailPageImageRepositoryAdapter } from '../detail-page-image.repository.adapter';

const ORG = '11111111-1111-4111-8111-111111111111';
const REVISION = '22222222-2222-4222-8222-222222222222';

describe('DetailPageImageRepositoryAdapter', () => {
  it('scopes artifact cache reads by organization and the complete variant key', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const adapter = new DetailPageImageRepositoryAdapter({
      detailPageImageArtifact: { findFirst },
    } as never);

    await adapter.findArtifact({
      organizationId: ORG,
      revisionId: REVISION,
      variant: 'wing-client-jpeg-v1',
      outputWidth: 780,
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        revisionId: REVISION,
        variant: 'wing-client-jpeg-v1',
        outputWidth: 780,
      },
    });
  });

  it('creates only a server-bound render intent record', async () => {
    const create = vi.fn().mockImplementation(({ data }) => ({
      id: '33333333-3333-4333-8333-333333333333',
      ...data,
      claimedByUserId: null,
      claimedAt: null,
      uploadedAt: null,
      completedAt: null,
      failedAt: null,
      failureCode: null,
      failureMessage: null,
      completedArtifactId: null,
      createdAt: new Date('2026-07-26T00:00:00.000Z'),
      updatedAt: new Date('2026-07-26T00:00:00.000Z'),
    }));
    const adapter = new DetailPageImageRepositoryAdapter({
      detailPageImageRenderIntent: { create },
    } as never);
    const expiresAt = new Date('2026-07-26T00:15:00.000Z');

    await adapter.createIntent({
      organizationId: ORG,
      detailPageId: '55555555-5555-4555-8555-555555555555',
      revisionId: REVISION,
      variant: 'wing-client-jpeg-v1',
      outputWidth: 780,
      objectKey: `detail-page-images/${ORG}/${REVISION}/wing-client-jpeg-v1-780.jpg`,
      requestedByUserId: '66666666-6666-4666-8666-666666666666',
      expiresAt,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        detailPageId: '55555555-5555-4555-8555-555555555555',
        revisionId: REVISION,
        variant: 'wing-client-jpeg-v1',
        outputWidth: 780,
        objectKey: `detail-page-images/${ORG}/${REVISION}/wing-client-jpeg-v1-780.jpg`,
        state: 'issued',
        requestedByUserId: '66666666-6666-4666-8666-666666666666',
        expiresAt,
      },
    });
  });
});
