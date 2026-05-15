import { describe, expect, it, vi } from 'vitest';
import { RegistrationWorkspaceService } from '../registration-workspace.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const REVISION_ID = '33333333-3333-4333-8333-333333333333';
const ARTIFACT_ID = '44444444-4444-4444-8444-444444444444';

function workspace(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKSPACE_ID,
    organizationId: ORG,
    ownerType: 'direct_detail_page',
    sourceCandidateId: null,
    targetMasterId: null,
    displayName: '키즈 텀블러',
    normalizedTitle: '키즈텀블러',
    status: 'active',
    currentDetailPageArtifactId: ARTIFACT_ID,
    currentDetailPageRevisionId: REVISION_ID,
    createdByUserId: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date('2026-05-12T01:00:00.000Z'),
    updatedAt: new Date('2026-05-12T03:00:00.000Z'),
    currentDetailPageArtifact: {
      id: ARTIFACT_ID,
      currentRevisionId: REVISION_ID,
      title: '키즈 텀블러 상세',
    },
    currentDetailPageRevision: {
      id: REVISION_ID,
      revisionType: 'generated',
      createdAt: new Date('2026-05-12T02:00:00.000Z'),
    },
    _count: { contentGenerations: 2 },
    contentGenerations: [
      generation({ id: 'generation-new', updatedAt: new Date('2026-05-12T04:00:00.000Z') }),
      generation({ id: 'generation-old', updatedAt: new Date('2026-05-12T02:00:00.000Z') }),
    ],
    ...overrides,
  };
}

function generation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'generation-1',
    contentType: 'detail_page',
    status: 'READY',
    generatedTitle: '키즈 텀블러 상세',
    templateId: 'kids-playful',
    generationInput: {
      rawTitle: '키즈 텀블러',
      imageUrls: ['https://example.com/input.jpg'],
    },
    generationResult: {
      templateId: 'bold-vertical',
      result: { hook: { text: '키즈 텀블러' } },
      imageUrls: ['https://example.com/input.jpg'],
      processedImages: { __heroBanner: 'https://example.com/hero.jpg' },
    },
    detailPageArtifactId: ARTIFACT_ID,
    createdAt: new Date('2026-05-12T01:30:00.000Z'),
    updatedAt: new Date('2026-05-12T02:00:00.000Z'),
    ...overrides,
  };
}

describe('RegistrationWorkspaceService', () => {
  it('reuses the raced workspace when a concurrent create wins the unique key', async () => {
    const existing = workspace({
      displayName: '키즈 터치등',
      normalizedTitle: '키즈터치등',
      contentGenerations: [],
      _count: { contentGenerations: 0 },
    });
    const prisma = {
      registrationWorkspace: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(existing),
        create: vi.fn().mockRejectedValue(Object.assign(new Error('Unique failed'), {
          code: 'P2002',
        })),
      },
    };
    const service = new RegistrationWorkspaceService(prisma as never);

    await expect(service.ensureForGeneration({
      organizationId: ORG,
      triggeredByUserId: 'user-1',
      rawTitle: '키즈 터치등',
      sourceCandidateId: null,
      targetMasterId: null,
    })).resolves.toEqual({
      id: WORKSPACE_ID,
      displayName: '키즈 터치등',
      normalizedTitle: '키즈터치등',
    });

    expect(prisma.registrationWorkspace.findFirst).toHaveBeenCalledTimes(2);
  });

  it('creates a registration workspace without a detail-page generation history', async () => {
    const emptyWorkspace = workspace({
      displayName: '키즈 컵',
      normalizedTitle: '키즈컵',
      currentDetailPageArtifactId: null,
      currentDetailPageRevisionId: null,
      currentDetailPageArtifact: null,
      currentDetailPageRevision: null,
      contentGenerations: [],
      _count: { contentGenerations: 0 },
    });
    const prisma = {
      registrationWorkspace: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(emptyWorkspace),
        create: vi.fn().mockResolvedValue({
          id: WORKSPACE_ID,
          displayName: '키즈 컵',
          normalizedTitle: '키즈컵',
        }),
      },
    };
    const service = new RegistrationWorkspaceService(prisma as never);

    await expect(service.createWorkspace({
      organizationId: ORG,
      triggeredByUserId: 'user-1',
      rawTitle: '키즈 컵',
      sourceCandidateId: null,
      targetMasterId: null,
    })).resolves.toMatchObject({
      id: WORKSPACE_ID,
      displayName: '키즈 컵',
      normalizedTitle: '키즈컵',
      generationCount: 0,
      latestGenerationId: null,
      latestStatus: null,
      currentDetailPageArtifactId: null,
      currentDetailPageRevisionId: null,
      history: [],
    });

    expect(prisma.registrationWorkspace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerType: 'direct_detail_page',
          displayName: '키즈 컵',
          normalizedTitle: '키즈컵',
          sourceCandidateId: null,
          targetMasterId: null,
        }),
      }),
    );
  });

  it('finds duplicate normalized titles and returns latest workspace and history metadata', async () => {
    const prisma = {
      registrationWorkspace: {
        findFirst: vi.fn().mockResolvedValue(workspace()),
      },
    };
    const service = new RegistrationWorkspaceService(prisma as never);

    await expect(service.checkDuplicate(ORG, '  키즈   텀블러  ')).resolves.toMatchObject({
      exists: true,
      workspace: {
        id: WORKSPACE_ID,
        displayName: '키즈 텀블러',
        normalizedTitle: '키즈텀블러',
        generationCount: 2,
        latestGenerationId: 'generation-new',
        currentDetailPageArtifactId: ARTIFACT_ID,
        currentDetailPageRevisionId: REVISION_ID,
      },
    });

    expect(prisma.registrationWorkspace.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          normalizedTitle: '키즈텀블러',
          status: 'active',
          isDeleted: false,
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    );
  });

  it('lists registered workspaces as one card with multiple ContentGeneration history rows', async () => {
    const prisma = {
      registrationWorkspace: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          workspace({
            contentGenerations: [
              generation({ id: 'generation-new', status: 'READY', updatedAt: new Date('2026-05-12T04:00:00.000Z') }),
              generation({ id: 'generation-old', status: 'FAILED', updatedAt: new Date('2026-05-12T02:00:00.000Z') }),
            ],
            _count: { contentGenerations: 2 },
          }),
        ]),
      },
    };
    const service = new RegistrationWorkspaceService(prisma as never);

    await expect(service.list(ORG)).resolves.toMatchObject({
      total: 1,
      items: [
        {
          id: WORKSPACE_ID,
          href: `/product-pipeline/registered-products/${WORKSPACE_ID}`,
          generationCount: 2,
          latestGenerationId: 'generation-new',
          latestStatus: 'READY',
          history: [
            {
              id: 'generation-new',
              status: 'READY',
              detailPageData: { hook: { text: '키즈 텀블러' } },
              imageUrls: ['https://example.com/input.jpg'],
              processedImages: { __heroBanner: 'https://example.com/hero.jpg' },
              href: `/product-pipeline/detail-pages/generation-new/editor?returnTo=%2Fproduct-pipeline%2Fregistered-products%2F${WORKSPACE_ID}`,
            },
            { id: 'generation-old', status: 'FAILED' },
          ],
        },
      ],
    });

    expect(prisma.registrationWorkspace.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, status: 'active', isDeleted: false },
      }),
    );
  });
});
