import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ThumbnailGenerationJobService } from '../application/service/thumbnail-generation-job.service';
import { ThumbnailGenerationService } from '../application/service/thumbnail-generation.service';
import type { ThumbnailEditorInputImage } from '../domain/model/thumbnail-editor';
import type { ProductGenerationAlertService } from '../application/service/product-generation-alert.service';

const ORGANIZATION_ID = 'organization-1';
const PRODUCT_ID = '7d000000-0000-4000-8000-000000000001';
const SOURCE_CANDIDATE_ID = '7d000000-0000-4000-8000-000000000002';
const REGISTRATION_WORKSPACE_ID = '7d000000-0000-4000-8000-000000000004';
const GENERATION_ID = '7d000000-0000-4000-8000-000000000010';
const REQUEST_ID = '7d000000-0000-4000-8000-000000000020';

function makeProductRow(over: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    name: 'Master',
    imageUrl: 'https://example.com/p.jpg',
    thumbnailUrl: null,
    category: 'toys',
    images: [],
    thumbnailAnalyses: [
      {
        recompose: { kind: 'multi-pack-loose', requiresChoice: false },
        complianceGrade: 'PASS',
        complianceScores: {
          editSuggestions: { background_not_white: '배경을 순백으로 교체' },
        },
        overallScore: 80,
        grade: 'A',
        qualityAnalyzedAt: new Date(),
        complianceAnalyzedAt: new Date(),
      },
    ],
    ...over,
  };
}

function makeInputImage(over: Partial<ThumbnailEditorInputImage> = {}): ThumbnailEditorInputImage {
  return {
    data: 'YmFzZTY0',
    mimeType: 'image/jpeg',
    label: 'Product photo',
    url: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
    storageKey: 'thumbnail-inputs/x.jpg',
    role: 'product',
    sortOrder: 0,
    source: 'master_image',
    fileSize: 100,
    ...over,
  };
}

function makeOperationAlertsStub() {
  return {
    start: vi.fn(async () => ({})),
    succeed: vi.fn(async () => ({})),
    fail: vi.fn(async () => ({})),
    progress: vi.fn(async () => ({})),
    cancel: vi.fn(async () => ({})),
  };
}

function makeProductGenerationAlertsStub(): ProductGenerationAlertService {
  return {
    start: vi.fn().mockResolvedValue({}),
    recordChildStarted: vi.fn().mockResolvedValue({ status: 'started', alert: {} }),
    markChildFinished: vi.fn().mockResolvedValue({}),
  } as unknown as ProductGenerationAlertService;
}

function makeAgentRunnerStub() {
  return {
    runByType: vi.fn(async () => ({ ok: true, requestId: REQUEST_ID })),
    executeRequest: vi.fn(async () => ({ executed: true, requestId: REQUEST_ID })),
  };
}

async function flushInlineExecutor() {
  await new Promise((resolve) => setImmediate(resolve));
}

function makeService(input: {
  prisma: unknown;
  editorAi?: unknown;
  trackingService?: unknown;
  operationAlerts?: unknown;
  agentRunner?: unknown;
  productGenerationAlerts?: ProductGenerationAlertService;
}) {
  const operationAlerts = input.operationAlerts ?? makeOperationAlertsStub();
  const editorAi = input.editorAi ?? {
    resolveInputImage: vi.fn(),
    generateEdit: vi.fn(),
  };
  const jobService = new ThumbnailGenerationJobService(
    input.prisma as never,
    editorAi as never,
    operationAlerts as never,
    (input.agentRunner ?? makeAgentRunnerStub()) as never,
    input.productGenerationAlerts ?? makeProductGenerationAlertsStub(),
  );
  return new ThumbnailGenerationService(
    input.prisma as never,
    (input.trackingService ?? { create: vi.fn() }) as never,
    operationAlerts as never,
    jobService,
  );
}

function makeFullGenerationRow(over: Record<string, unknown> = {}) {
  return {
    id: GENERATION_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'succeeded',
    phase: 'ready',
    grade: 'F',
    score: 0,
    masterId: PRODUCT_ID,
    method: 'generate',
    originalUrl: 'https://example.com/p.jpg',
    selectedUrl: null,
    prompt: null,
    editAnalysis: null,
    inputMeta: { mode: 'edit' },
    inputMetaVersion: 1,
    errorMessage: null,
    attemptCount: 0,
    triggeredByUserId: null,
    candidates: [
      {
        id: 'cand-1',
        url: 'http://storage.local/kiditem/thumbnail-generations/a.png',
        storageKey: 'thumbnail-generations/a.png',
        filename: 'a.png',
        sortOrder: 0,
        mimeType: 'image/png',
        width: null,
        height: null,
        fileSize: 100,
      },
    ],
    inputImages: [
      {
        id: 'in-1',
        url: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
        storageKey: 'thumbnail-inputs/x.jpg',
        role: 'product',
        label: 'Product photo',
        sortOrder: 0,
        source: 'master_image',
        mimeType: 'image/jpeg',
        width: null,
        height: null,
        fileSize: 100,
        createdAt: new Date(),
      },
    ],
    registrationAttempts: [],
    master: {
      id: PRODUCT_ID,
      name: 'Master',
      imageUrl: 'https://example.com/p.jpg',
      thumbnailUrl: null,
      category: 'toys',
      images: [],
      thumbnailAnalyses: [
        {
          recompose: { kind: 'multi-pack-loose' },
          complianceGrade: 'PASS',
          complianceScores: { editSuggestions: { background_not_white: '배경을 순백으로 교체' } },
          overallScore: 80,
          grade: 'A',
          qualityAnalyzedAt: new Date(),
          complianceAnalyzedAt: new Date(),
        },
      ],
    },
    ...over,
  };
}

describe('ThumbnailGenerationService normalized persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saveEditorResult writes candidates and inputImages as relation rows', async () => {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      masterProduct: {
        findFirst: vi.fn(async () => ({
          id: PRODUCT_ID,
          name: 'Master',
          imageUrl: 'https://example.com/p.jpg',
          category: 'toys',
          organizationId: ORGANIZATION_ID,
        })),
      },
      thumbnailGeneration: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          created.push(args.data);
          return { id: GENERATION_ID };
        }),
      },
    };
    const service = makeService({ prisma });
    const id = await service.saveEditorResult({
      productId: PRODUCT_ID,
      organizationId: ORGANIZATION_ID,
      originalUrl: 'https://example.com/p.jpg',
      candidates: [
        { url: 'u1', storageKey: 'k1', filename: 'a.png', mimeType: 'image/png', fileSize: 100 },
      ],
      inputImages: [makeInputImage()],
      method: 'generate',
    });
    expect(id).toBe(GENERATION_ID);
    expect(created[0].candidates).toMatchObject({
      create: [
        expect.objectContaining({
          url: 'u1',
          storageKey: 'k1',
          mimeType: 'image/png',
        }),
      ],
    });
    expect(created[0].inputImages).toMatchObject({
      create: [
        expect.objectContaining({
          url: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
          role: 'product',
        }),
      ],
    });
  });

  it('saveEditorResult refuses to create a generation for a product outside the caller organization', async () => {
    const prisma = {
      masterProduct: {
        findFirst: vi.fn(async () => null),
      },
      thumbnailGeneration: {
        create: vi.fn(async () => ({ id: GENERATION_ID })),
      },
    };
    const service = makeService({ prisma });

    await expect(
      service.saveEditorResult({
        productId: PRODUCT_ID,
        organizationId: ORGANIZATION_ID,
        originalUrl: 'https://example.com/p.jpg',
        candidates: [
          { url: 'u1', storageKey: 'k1', filename: 'a.png', mimeType: 'image/png', fileSize: 100 },
        ],
        method: 'generate',
      }),
    ).rejects.toThrow(`MasterProduct ${PRODUCT_ID} not found`);

    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID, organizationId: ORGANIZATION_ID, isDeleted: false },
      select: { id: true, name: true, imageUrl: true, category: true, organizationId: true },
    });
    expect(prisma.thumbnailGeneration.create).not.toHaveBeenCalled();
  });

  it('enqueueEditorGeneration kicks the queued thumbnail request through the executor path', async () => {
    const agentRunner = makeAgentRunnerStub();
    const operationAlerts = makeOperationAlertsStub();
    const prisma = {
      thumbnailGeneration: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
          id: GENERATION_ID,
          ...args.data,
        })),
      },
      thumbnailGenerationInputImage: {
        createMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const service = makeService({ prisma, agentRunner, operationAlerts });

    const result = await service.enqueueEditorGeneration({
      organizationId: ORGANIZATION_ID,
      productId: PRODUCT_ID,
      productName: 'Master',
      triggeredByUserId: null,
      inputs: [makeInputImage()],
      inputMeta: { mode: 'edit', inputCount: 1 },
      method: 'generate',
      originalUrl: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
      agentPayload: { mode: 'edit', inputs: [] },
    });

    expect(result).toEqual({ generationId: GENERATION_ID, status: 'pending' });
    expect(agentRunner.runByType).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceResourceType: 'thumbnail_generation',
        sourceResourceId: GENERATION_ID,
      }),
    );
    expect(agentRunner.executeRequest).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      requestId: REQUEST_ID,
      workerId: 'thumbnail-generate-inline',
    });
  });

  it('enqueueCandidateGeneration creates a pending generation scoped to the sourcing candidate', async () => {
    const agentRunner = makeAgentRunnerStub();
    const operationAlerts = makeOperationAlertsStub();
    const prisma = {
      sourcingCandidate: {
        findFirst: vi.fn(async () => ({
          id: SOURCE_CANDIDATE_ID,
          name: 'Candidate toy',
          category: 'Toys',
          images: [
            {
              id: 'candidate-image-1',
              url: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
              storageKey: 'thumbnail-inputs/x.jpg',
            },
          ],
        })),
      },
      thumbnailGeneration: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
          id: GENERATION_ID,
          ...args.data,
        })),
      },
      thumbnailGenerationInputImage: {
        createMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const service = makeService({ prisma, agentRunner, operationAlerts });

    const result = await service.enqueueCandidateGeneration({
      organizationId: ORGANIZATION_ID,
      sourceCandidateId: SOURCE_CANDIDATE_ID,
      productName: 'Candidate toy',
      triggeredByUserId: null,
      inputs: [makeInputImage({ source: 'sourcing_candidate' })],
      inputMeta: { mode: 'edit', inputCount: 1 },
      method: 'generate',
      originalUrl: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
      agentPayload: { mode: 'edit', inputs: [] },
    });

    expect(result).toEqual({ generationId: GENERATION_ID, status: 'pending' });
    expect(prisma.sourcingCandidate.findFirst).toHaveBeenCalledWith({
      where: { id: SOURCE_CANDIDATE_ID, organizationId: ORGANIZATION_ID, isDeleted: false },
      select: {
        id: true,
        name: true,
        category: true,
        images: {
          where: { isDeleted: false },
          select: { id: true, url: true, storageKey: true },
        },
      },
    });
    expect(prisma.thumbnailGeneration.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        masterId: null,
        sourceCandidateId: SOURCE_CANDIDATE_ID,
        status: 'pending',
        phase: null,
      }),
    }));
    expect(prisma.thumbnailGenerationInputImage.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          generationId: GENERATION_ID,
          source: 'sourcing_candidate',
          candidateImageId: 'candidate-image-1',
          storageKey: 'thumbnail-inputs/x.jpg',
        }),
      ],
    });
    expect(agentRunner.runByType).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceResourceType: 'thumbnail_generation',
        sourceResourceId: GENERATION_ID,
      }),
    );
    expect(agentRunner.executeRequest).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      requestId: REQUEST_ID,
      workerId: 'thumbnail-generate-inline',
    });
    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceId: GENERATION_ID,
        targetType: 'sourcing_candidate',
        targetId: SOURCE_CANDIDATE_ID,
        href: `/product-pipeline/collected-products/${SOURCE_CANDIDATE_ID}`,
      }),
    );
  });

  it('suppresses child thumbnail operation alert when linked to product generation parent', async () => {
    const agentRunner = makeAgentRunnerStub();
    const operationAlerts = makeOperationAlertsStub();
    const productGenerationAlerts = makeProductGenerationAlertsStub();
    const prisma = {
      $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
      sourcingCandidate: {
        findFirst: vi.fn(async () => ({
          id: SOURCE_CANDIDATE_ID,
          name: 'Candidate toy',
          category: 'Toys',
          images: [],
        })),
      },
      thumbnailGeneration: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
          id: GENERATION_ID,
          ...args.data,
        })),
      },
      thumbnailGenerationInputImage: {
        createMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const service = makeService({
      prisma,
      agentRunner,
      operationAlerts,
      productGenerationAlerts,
    });

    await service.enqueueCandidateGeneration({
      organizationId: ORGANIZATION_ID,
      sourceCandidateId: SOURCE_CANDIDATE_ID,
      productName: 'Candidate toy',
      triggeredByUserId: null,
      inputs: [makeInputImage({ source: 'sourcing_candidate' })],
      inputMeta: { mode: 'edit', inputCount: 1 },
      method: 'generate',
      originalUrl: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
      agentPayload: { mode: 'edit', inputs: [] },
      operationAlert: {
        mode: 'parent',
        batchId: 'batch-1',
        parentOperationKey: 'product-generation:batch-1',
        childKind: 'thumbnail',
      },
    });

    expect(operationAlerts.start).not.toHaveBeenCalledWith(
      expect.objectContaining({ operationKey: `thumbnail-edit:${GENERATION_ID}` }),
    );
    expect(productGenerationAlerts.recordChildStarted).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      parentOperationKey: 'product-generation:batch-1',
      childKind: 'thumbnail',
      childId: GENERATION_ID,
    });
    expect(prisma.thumbnailGeneration.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        inputMeta: expect.objectContaining({
          mode: 'edit',
          inputCount: 1,
          productGeneration: {
            mode: 'parent',
            productGenerationBatchId: 'batch-1',
            parentOperationKey: 'product-generation:batch-1',
            childKind: 'thumbnail',
          },
        }),
      }),
    }));
  });

  it('cancels parent-mode thumbnail child without Agent OS enqueue when parent is already terminal', async () => {
    const agentRunner = makeAgentRunnerStub();
    const operationAlerts = makeOperationAlertsStub();
    const productGenerationAlerts = makeProductGenerationAlertsStub();
    productGenerationAlerts.recordChildStarted = vi.fn().mockResolvedValue({
      status: 'parent_terminal',
      alert: { status: 'cancelled' },
    });
    const prisma = {
      $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
      sourcingCandidate: {
        findFirst: vi.fn(async () => ({
          id: SOURCE_CANDIDATE_ID,
          name: 'Candidate toy',
          category: 'Toys',
          images: [],
        })),
      },
      thumbnailGeneration: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
          id: GENERATION_ID,
          ...args.data,
        })),
        findFirst: vi.fn(async () => ({
          id: GENERATION_ID,
          organizationId: ORGANIZATION_ID,
          status: 'pending',
          phase: null,
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      thumbnailGenerationInputImage: {
        createMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const service = makeService({
      prisma,
      agentRunner,
      operationAlerts,
      productGenerationAlerts,
    });

    const result = await service.enqueueCandidateGeneration({
      organizationId: ORGANIZATION_ID,
      sourceCandidateId: SOURCE_CANDIDATE_ID,
      productName: 'Candidate toy',
      triggeredByUserId: null,
      inputs: [makeInputImage({ source: 'sourcing_candidate' })],
      inputMeta: { mode: 'edit', inputCount: 1 },
      method: 'generate',
      originalUrl: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
      agentPayload: { mode: 'edit', inputs: [] },
      operationAlert: {
        mode: 'parent',
        batchId: 'batch-1',
        parentOperationKey: 'product-generation:batch-1',
        childKind: 'thumbnail',
      },
    });

    expect(result).toEqual({ generationId: GENERATION_ID, status: 'cancelled' });
    expect(prisma.thumbnailGeneration.updateMany).toHaveBeenCalledWith({
      where: {
        id: GENERATION_ID,
        organizationId: ORGANIZATION_ID,
        isDeleted: false,
        status: { in: ['pending', 'running'] },
      },
      data: { status: 'cancelled', phase: null },
    });
    expect(agentRunner.runByType).not.toHaveBeenCalled();
  });

  it('routes parent-mode thumbnail enqueue failures to the product generation parent alert', async () => {
    const agentRunner = makeAgentRunnerStub();
    agentRunner.runByType = vi.fn(async () => ({ ok: false, reason: 'queue down' }));
    const operationAlerts = makeOperationAlertsStub();
    const productGenerationAlerts = makeProductGenerationAlertsStub();
    const prisma = {
      $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
      sourcingCandidate: {
        findFirst: vi.fn(async () => ({
          id: SOURCE_CANDIDATE_ID,
          name: 'Candidate toy',
          category: 'Toys',
          images: [],
        })),
      },
      thumbnailGeneration: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
          id: GENERATION_ID,
          ...args.data,
        })),
        findFirst: vi.fn(async () => ({
          id: GENERATION_ID,
          organizationId: ORGANIZATION_ID,
          status: 'pending',
          phase: null,
          attemptCount: 0,
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      thumbnailGenerationInputImage: {
        createMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const service = makeService({
      prisma,
      agentRunner,
      operationAlerts,
      productGenerationAlerts,
    });

    await expect(
      service.enqueueCandidateGeneration({
        organizationId: ORGANIZATION_ID,
        sourceCandidateId: SOURCE_CANDIDATE_ID,
        productName: 'Candidate toy',
        triggeredByUserId: null,
        inputs: [makeInputImage({ source: 'sourcing_candidate' })],
        inputMeta: { mode: 'edit', inputCount: 1 },
        method: 'generate',
        originalUrl: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
        agentPayload: { mode: 'edit', inputs: [] },
        operationAlert: {
          mode: 'parent',
          batchId: 'batch-1',
          parentOperationKey: 'product-generation:batch-1',
          childKind: 'thumbnail',
        },
      }),
    ).rejects.toThrow('Agent OS enqueue failed: queue down');

    expect(productGenerationAlerts.markChildFinished).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      parentOperationKey: 'product-generation:batch-1',
      childKind: 'thumbnail',
      status: 'failed',
      childId: GENERATION_ID,
      errorMessage: 'Agent OS enqueue failed: queue down',
    });
    expect(operationAlerts.fail).not.toHaveBeenCalledWith(
      ORGANIZATION_ID,
      `thumbnail-edit:${GENERATION_ID}`,
      expect.anything(),
    );
  });

  it('enqueueStandaloneGeneration creates a pending generation without master or sourcing candidate linkage', async () => {
    const agentRunner = makeAgentRunnerStub();
    const operationAlerts = makeOperationAlertsStub();
    const prisma = {
      thumbnailGeneration: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
          id: GENERATION_ID,
          ...args.data,
        })),
      },
      thumbnailGenerationInputImage: {
        createMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const service = makeService({ prisma, agentRunner, operationAlerts });

    const result = await service.enqueueStandaloneGeneration({
      organizationId: ORGANIZATION_ID,
      productName: 'Uploaded toy',
      triggeredByUserId: null,
      inputs: [makeInputImage({ source: 'upload' })],
      inputMeta: { mode: 'edit', inputCount: 1 },
      method: 'generate',
      originalUrl: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
      agentPayload: { mode: 'edit', inputs: [] },
    });

    expect(result).toEqual({ generationId: GENERATION_ID, status: 'pending' });
    expect(prisma.thumbnailGeneration.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        masterId: null,
        sourceCandidateId: null,
        status: 'pending',
        phase: null,
      }),
    }));
    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceId: GENERATION_ID,
        targetType: 'thumbnail_generation',
        targetId: GENERATION_ID,
        href: `/product-pipeline/thumbnail-generation/edit?generationId=${GENERATION_ID}`,
        metadata: expect.objectContaining({ standalone: true }),
      }),
    );
    expect(agentRunner.executeRequest).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      requestId: REQUEST_ID,
      workerId: 'thumbnail-generate-inline',
    });
  });

  it('enqueueStandaloneGeneration can scope ownerless registered workspace work without creating an inbox card', async () => {
    const agentRunner = makeAgentRunnerStub();
    const operationAlerts = makeOperationAlertsStub();
    const prisma = {
      thumbnailGeneration: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
          id: GENERATION_ID,
          ...args.data,
        })),
      },
      thumbnailGenerationInputImage: {
        createMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const service = makeService({ prisma, agentRunner, operationAlerts });

    const result = await service.enqueueStandaloneGeneration({
      organizationId: ORGANIZATION_ID,
      contentWorkspaceId: REGISTRATION_WORKSPACE_ID,
      productName: 'Registered workspace toy',
      triggeredByUserId: null,
      inputs: [makeInputImage({ source: 'upload' })],
      inputMeta: { mode: 'edit', inputCount: 1 },
      method: 'generate',
      originalUrl: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
      agentPayload: { mode: 'edit', inputs: [] },
    });

    expect(result).toEqual({ generationId: GENERATION_ID, status: 'pending' });
    expect(prisma.thumbnailGeneration.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        masterId: null,
        sourceCandidateId: null,
        contentWorkspaceId: REGISTRATION_WORKSPACE_ID,
      }),
    }));
    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: 'content_workspace',
        targetId: REGISTRATION_WORKSPACE_ID,
        href: `/product-pipeline/registered-products/${REGISTRATION_WORKSPACE_ID}`,
        metadata: expect.objectContaining({
          contentWorkspaceId: REGISTRATION_WORKSPACE_ID,
          standalone: false,
        }),
      }),
    );
  });

  it('drains retryable thumbnail executor failures so a local preview does not leave the job pending forever', async () => {
    const agentRunner = makeAgentRunnerStub();
    agentRunner.executeRequest = vi.fn(async () => ({
      executed: true,
      requestId: REQUEST_ID,
      errorCode: 'runtime_error',
    }));
    const operationAlerts = makeOperationAlertsStub();
    const prisma = {
      sourcingCandidate: {
        findFirst: vi.fn(async () => ({
          id: SOURCE_CANDIDATE_ID,
          name: 'Candidate toy',
          category: 'Toys',
          images: [],
        })),
      },
      thumbnailGeneration: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
          id: GENERATION_ID,
          ...args.data,
        })),
      },
      thumbnailGenerationInputImage: {
        createMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const service = makeService({ prisma, agentRunner, operationAlerts });

    await service.enqueueCandidateGeneration({
      organizationId: ORGANIZATION_ID,
      sourceCandidateId: SOURCE_CANDIDATE_ID,
      productName: 'Candidate toy',
      triggeredByUserId: null,
      inputs: [makeInputImage({ source: 'sourcing_candidate' })],
      inputMeta: { mode: 'edit', inputCount: 1 },
      method: 'generate',
      originalUrl: 'http://storage.local/kiditem/thumbnail-inputs/x.jpg',
      agentPayload: { mode: 'edit', inputs: [] },
    });
    await flushInlineExecutor();

    expect(agentRunner.executeRequest).toHaveBeenCalledTimes(3);
    expect(agentRunner.executeRequest).toHaveBeenNthCalledWith(3, {
      organizationId: ORGANIZATION_ID,
      requestId: REQUEST_ID,
      workerId: 'thumbnail-generate-inline',
    });
  });

  it('findAll renders product data from a scoped master lookup instead of relation include data', async () => {
    const prisma = {
      masterProduct: {
        findMany: vi.fn(async () => [
          {
            id: PRODUCT_ID,
            name: 'Caller-owned master',
            imageUrl: 'https://example.com/owned.jpg',
            category: 'toys',
          },
        ]),
      },
      thumbnailGeneration: {
        findMany: vi.fn(async () => [
          makeFullGenerationRow({
            master: {
              id: PRODUCT_ID,
              name: 'Cross-tenant relation master',
              imageUrl: 'https://example.com/other.jpg',
              category: 'other',
            },
          }),
        ]),
      },
    };
    const service = makeService({ prisma });

    const result = await service.findAll(ORGANIZATION_ID);

    expect(prisma.masterProduct.findMany).toHaveBeenCalledWith({
      where: { id: { in: [PRODUCT_ID] }, organizationId: ORGANIZATION_ID, isDeleted: false },
      select: { id: true, name: true, imageUrl: true, category: true },
    });
    expect(result.items[0].product).toMatchObject({
      id: PRODUCT_ID,
      name: 'Caller-owned master',
      imageUrl: 'https://example.com/owned.jpg',
      category: 'toys',
    });
  });

  it('createEditJobs creates pending jobs without blocking on Gemini', async () => {
    const prisma = {
      masterProduct: {
        findMany: vi.fn(async () => [makeProductRow()]),
      },
      thumbnailGeneration: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => makeFullGenerationRow({
          status: 'pending',
          phase: null,
          candidates: [],
        })),
      },
    };
    const editorAi = {
      resolveInputImage: vi.fn(async () => makeInputImage()),
      generateEdit: vi.fn(async () => [
        { url: 'u', storageKey: 'k', filename: 'a.png', mimeType: 'image/png', fileSize: 50 },
      ]),
    };
    const service = makeService({ prisma, editorAi });
    const schedule = vi
      .spyOn(service as unknown as { scheduleEditJob: () => void }, 'scheduleEditJob')
      .mockImplementation(() => {});
    const [created] = await service.createEditJobs(
      [PRODUCT_ID],
      ORGANIZATION_ID,
      'compliance',
      'auto',
      null,
      'generate',
    );

    expect(created.status).toBe('pending');
    expect(editorAi.generateEdit).not.toHaveBeenCalled();
    expect(prisma.thumbnailGeneration.create.mock.calls[0][0].data).toMatchObject({
      method: 'generate',
      status: 'pending',
      phase: null,
    });
    expect(schedule).toHaveBeenCalledWith(GENERATION_ID, ORGANIZATION_ID, 'compliance', 'auto');
  });

  it('processEditJob feeds stored recompose kind and edit suggestions into prompt', async () => {
    const tx = {
      thumbnailGeneration: {
        findFirst: vi.fn(async () => ({ id: GENERATION_ID })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      thumbnailGenerationCandidate: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async () => ({ count: 1 })),
      },
      thumbnailGenerationInputImage: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const prisma = {
      masterProduct: {
        findFirst: vi.fn(async () => makeProductRow()),
      },
      thumbnailGeneration: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findFirst: vi.fn(async () => makeFullGenerationRow({
          status: 'running',
          phase: null,
          candidates: [],
          inputImages: [],
        })),
      },
      $transaction: vi.fn(async (cb: (txArg: typeof tx) => Promise<void>) => cb(tx)),
    };
    const editorAi = {
      resolveInputImage: vi.fn(async () => makeInputImage()),
      generateEdit: vi.fn(async () => [
        { url: 'u', storageKey: 'k', filename: 'a.png', mimeType: 'image/png', fileSize: 50 },
      ]),
    };
    const service = makeService({ prisma, editorAi });

    await (service as unknown as {
      processEditJob: (
        id: string,
        organizationId: string,
        purpose: 'compliance',
        variantKey: 'auto',
      ) => Promise<void>;
    }).processEditJob(GENERATION_ID, ORGANIZATION_ID, 'compliance', 'auto');

    const editArgs = editorAi.generateEdit.mock.calls[0][2];
    expect(typeof editArgs.promptOverride).toBe('string');
    expect(editArgs.editSuggestions).toEqual({
      background_not_white: '배경을 순백으로 교체',
    });
    expect(editArgs.referenceMode).toBe('edit-image');
    expect(tx.thumbnailGenerationCandidate.createMany).toHaveBeenCalled();
    const finishUpdate = tx.thumbnailGeneration.updateMany.mock.calls.find(
      ([arg]) => arg.data?.status === 'succeeded',
    )?.[0];
    expect(finishUpdate?.data).toMatchObject({
      status: 'succeeded',
      phase: 'ready',
    });
  });

  it('createAutoBatch routes through createEditJobs and keeps method auto', async () => {
    const prisma = {
      masterProduct: {
        findMany: vi.fn(async () => [{ id: PRODUCT_ID }]),
      },
      thumbnailGeneration: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => makeFullGenerationRow({
          status: 'pending',
          phase: null,
          method: 'auto',
          candidates: [],
        })),
      },
    };
    const masterFindMany = vi.fn(async () => [makeProductRow()]);
    (prisma.masterProduct.findMany as unknown) = vi
      .fn()
      .mockImplementationOnce(async () => [{ id: PRODUCT_ID }])
      .mockImplementationOnce(async () => [makeProductRow()]);
    (prisma.thumbnailGeneration.findFirst as unknown) = vi
      .fn()
      .mockResolvedValueOnce(null) // cooldown check
      .mockResolvedValueOnce(null); // active job check
    const editorAi = {
      resolveInputImage: vi.fn(async () => makeInputImage()),
      generateEdit: vi.fn(async () => [
        { url: 'u', storageKey: 'k', filename: 'a.png', mimeType: 'image/png', fileSize: 50 },
      ]),
    };
    const service = makeService({ prisma, editorAi });
    vi
      .spyOn(service as unknown as { scheduleEditJob: () => void }, 'scheduleEditJob')
      .mockImplementation(() => {});
    const result = await service.createAutoBatch(ORGANIZATION_ID, 1);
    expect(result.attempted).toBe(1);
    const createData = (prisma.thumbnailGeneration.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0].data;
    expect(createData.method).toBe('auto');
    void masterFindMany;
  });
});
