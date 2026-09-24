import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerationService } from '../thumbnail-generation.service';
import type { ThumbnailGenerationLedgerRepositoryPort } from '../../port/out/repository/thumbnail-generation-ledger.repository.port';

const ORGANIZATION_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '99999999-9999-9999-9999-999999999999';
const WORKSPACE_ID = '22222222-2222-2222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  resolveWorkspaceThumbnailSource: vi.fn(),
}));

vi.mock('../../../domain/thumbnail-workspace-source', () => ({
  resolveWorkspaceThumbnailSource: mocks.resolveWorkspaceThumbnailSource,
}));

function makeGenerationJobsStub() {
  return {
    enqueueEditorGeneration: vi.fn(),
    scheduleEditJob: vi.fn().mockResolvedValue(undefined),
    processEditJob: vi.fn(),
  };
}

function makeLedgerStub(): ThumbnailGenerationLedgerRepositoryPort {
  return {
    findWorkspacesForThumbnailJobs: vi.fn().mockResolvedValue(
      new Map([[WORKSPACE_ID, {
        id: WORKSPACE_ID,
        name: '검증용 상품',
        imageUrl: 'https://cdn.example.com/source.jpg',
        thumbnailUrl: null,
        category: null,
        images: [],
      }]]),
    ),
    findActiveJobForWorkspace: vi.fn().mockResolvedValue(null),
    openPendingEditorJob: vi.fn().mockResolvedValue({
      id: GENERATION_ID,
      contentWorkspaceId: WORKSPACE_ID,
      status: 'pending',
      method: 'generate',
      prompt: null,
      inputMeta: {},
      errorMessage: null,
      attemptCount: 0,
      triggeredByUserId: USER_ID,
      createdAt: new Date('2026-09-23T00:00:00Z'),
      updatedAt: new Date('2026-09-23T00:00:00Z'),
    }),
    cancelDirectGeneration: vi.fn().mockResolvedValue({
      status: 'cancelled',
      generationId: GENERATION_ID,
      preserved: false,
    }),
    findGenerationProjectionStatus: vi.fn().mockResolvedValue({
      id: GENERATION_ID,
      status: 'running',
      inputMeta: null,
      errorMessage: null,
    }),
  } as unknown as ThumbnailGenerationLedgerRepositoryPort;
}

function makeService(ledger: ThumbnailGenerationLedgerRepositoryPort = makeLedgerStub()) {
  const generationJobs = makeGenerationJobsStub();
  return {
    ledger,
    generationJobs,
    service: new ThumbnailGenerationService(ledger, {} as never, generationJobs as never),
  };
}

describe('ThumbnailGenerationService', () => {
  let setImmediateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setImmediateSpy = vi.spyOn(globalThis, 'setImmediate').mockImplementation(() => 0 as never);
    mocks.resolveWorkspaceThumbnailSource.mockReturnValue('https://cdn.example.com/source.jpg');
  });

  afterEach(() => setImmediateSpy.mockRestore());

  it('opens and schedules an editor job owned by its ContentWorkspace', async () => {
    const { service, ledger, generationJobs } = makeService();

    await expect(service.createEditJobs([WORKSPACE_ID], ORGANIZATION_ID, 'compliance', 'auto', USER_ID))
      .resolves.toEqual([expect.objectContaining({ id: GENERATION_ID, status: 'pending', contentWorkspaceId: WORKSPACE_ID })]);

    expect(ledger.openPendingEditorJob).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      contentWorkspaceId: WORKSPACE_ID,
      triggeredByUserId: USER_ID,
    }));
    expect(generationJobs.scheduleEditJob).toHaveBeenCalledWith(
      GENERATION_ID,
      ORGANIZATION_ID,
      'compliance',
      'auto',
    );
  });

  it('cancels the direct job and generation atomically through the thumbnail owner', async () => {
    const { service, ledger } = makeService();

    await expect(service.cancelGeneration({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
      actorUserId: USER_ID,
      reason: '사용자 요청',
    })).resolves.toEqual({
      status: 'cancelled',
      generationId: GENERATION_ID,
      preserved: false,
    });
    expect(ledger.cancelDirectGeneration).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      generationId: GENERATION_ID,
      reason: '사용자 요청',
    });
  });
});
