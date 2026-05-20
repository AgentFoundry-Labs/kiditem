import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostPromotionAiService } from '../post-promotion-ai.service';
import {
  AI_JOB_SOURCE_TYPES,
  DetailPageGenerateDirectInputSchema,
  ThumbnailGenerateDirectInputSchema,
} from '../../../domain/direct-generation';
import type { OperationAlertPort } from '../../port/out/cross-domain/operation-alert.port';
import type { ThumbnailEditorAiService } from '../thumbnail-editor-ai.service';
import type { ThumbnailEditorInputImage } from '../../../domain/model/thumbnail-editor';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const MASTER_ID = '22222222-2222-4222-8222-222222222222';
const CONTENT_GEN_ID = '33333333-3333-4333-8333-333333333333';
const THUMBNAIL_GEN_ID = '44444444-4444-4444-8444-444444444444';
const CONTENT_GROUP_ID = '55555555-5555-4555-8555-555555555555';

interface MockState {
  master: {
    id: string;
    name: string;
    category: string | null;
    description: string;
    imageUrl: string | null;
  } | null;
  images: Array<{ url: string }>;
}

interface Mocks {
  repository: {
    findMasterContext: ReturnType<typeof vi.fn>;
    createDetailPageGeneration: ReturnType<typeof vi.fn>;
    markDetailPageFailed: ReturnType<typeof vi.fn>;
    createThumbnailGeneration: ReturnType<typeof vi.fn>;
    markThumbnailFailed: ReturnType<typeof vi.fn>;
  };
  productWorkspaceGroups: {
    ensureProductWorkspaceGroup: ReturnType<typeof vi.fn>;
  };
  detailPageJobs: { schedule: ReturnType<typeof vi.fn> };
  thumbnailJobs: { schedule: ReturnType<typeof vi.fn> };
  operationAlerts: OperationAlertPort & {
    start: ReturnType<typeof vi.fn>;
    fail: ReturnType<typeof vi.fn>;
    succeed: ReturnType<typeof vi.fn>;
  };
  editorAi: ThumbnailEditorAiService & {
    resolveInputImage: ReturnType<typeof vi.fn>;
  };
  contentAssets: {
    recordDetailPageInputAssets: ReturnType<typeof vi.fn>;
  };
  contentGenerationCreate: ReturnType<typeof vi.fn>;
  markDetailPageFailed: ReturnType<typeof vi.fn>;
  thumbnailGenerationCreate: ReturnType<typeof vi.fn>;
  markThumbnailFailed: ReturnType<typeof vi.fn>;
}

function buildMocks(state: MockState): Mocks {
  const contentGenerationCreate = vi.fn().mockResolvedValue({
    id: CONTENT_GEN_ID,
  });
  const markDetailPageFailed = vi.fn().mockResolvedValue(undefined);
  const thumbnailGenerationCreate = vi.fn().mockResolvedValue({
    id: THUMBNAIL_GEN_ID,
  });
  const markThumbnailFailed = vi.fn().mockResolvedValue(undefined);

  const repository = {
    findMasterContext: vi.fn().mockResolvedValue(state.master
      ? {
          ...state.master,
          imageUrls: state.images
            .map((image) => image.url)
            .filter((url): url is string => typeof url === 'string' && url.length > 0),
        }
      : null),
    createDetailPageGeneration: contentGenerationCreate,
    markDetailPageFailed,
    createThumbnailGeneration: thumbnailGenerationCreate,
    markThumbnailFailed,
  };
  const productWorkspaceGroups = {
    ensureProductWorkspaceGroup: vi.fn().mockResolvedValue({
      id: CONTENT_GROUP_ID,
      targetMasterId: MASTER_ID,
    }),
  };

  const detailPageJobs = {
    schedule: vi.fn(),
  };
  const thumbnailJobs = {
    schedule: vi.fn(),
  };

  const operationAlerts = {
    start: vi.fn().mockResolvedValue({}),
    fail: vi.fn().mockResolvedValue({}),
    succeed: vi.fn().mockResolvedValue({}),
    progress: vi.fn().mockResolvedValue({}),
    cancel: vi.fn().mockResolvedValue({}),
  } as unknown as Mocks['operationAlerts'];

  const resolvedInput: ThumbnailEditorInputImage = {
    data: 'BASE64STUB',
    mimeType: 'image/jpeg',
    label: 'Product photo',
    url: 'https://cdn.example.com/master/primary.jpg',
    storageKey: 'master/primary.jpg',
    role: 'product',
    sortOrder: 0,
    source: 'master_image',
    fileSize: 12345,
  };

  const editorAi = {
    resolveInputImage: vi.fn().mockResolvedValue(resolvedInput),
  } as unknown as Mocks['editorAi'];
  const contentAssets = {
    recordDetailPageInputAssets: vi.fn().mockResolvedValue([]),
  };

  return {
    repository,
    productWorkspaceGroups,
    detailPageJobs,
    thumbnailJobs,
    operationAlerts,
    editorAi,
    contentAssets,
    contentGenerationCreate,
    markDetailPageFailed,
    thumbnailGenerationCreate,
    markThumbnailFailed,
  };
}

function makeService(mocks: Mocks): PostPromotionAiService {
  return new PostPromotionAiService(
    mocks.repository as never,
    mocks.productWorkspaceGroups as never,
    mocks.operationAlerts,
    mocks.editorAi,
    mocks.contentAssets as never,
    mocks.detailPageJobs as never,
    mocks.thumbnailJobs as never,
  );
}

describe('PostPromotionAiService', () => {
  let mocks: Mocks;
  let svc: PostPromotionAiService;

  beforeEach(() => {
    mocks = buildMocks({
      master: {
        id: MASTER_ID,
        name: 'Test Master',
        category: 'Kids/Toys',
        description: 'Lovely test toy',
        imageUrl: 'https://cdn.example.com/master/primary.jpg',
      },
      images: [
        { url: 'https://cdn.example.com/master/primary.jpg' },
        { url: 'https://cdn.example.com/master/extra1.jpg' },
      ],
    });
    svc = makeService(mocks);
  });

  it('happy path: creates ContentGeneration + ThumbnailGeneration, starts alerts, and schedules both direct AI jobs with schema-valid payloads', async () => {
    await svc.fireForMaster(MASTER_ID, ORGANIZATION_ID);

    expect(mocks.repository.findMasterContext).toHaveBeenCalledWith({
      masterId: MASTER_ID,
      organizationId: ORGANIZATION_ID,
    });
    expect(mocks.productWorkspaceGroups.ensureProductWorkspaceGroup).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      productId: MASTER_ID,
      title: 'Test Master',
      triggeredByUserId: null,
      source: 'post_promotion',
    });

    // ContentGeneration row created with PROCESSING and detail-page payload includes the full raw block
    expect(mocks.contentGenerationCreate).toHaveBeenCalledTimes(1);
    const contentCall = mocks.contentGenerationCreate.mock.calls[0][0];
    expect(contentCall.organizationId).toBe(ORGANIZATION_ID);
    expect(contentCall.generationGroupId).toBe(CONTENT_GROUP_ID);
    expect(contentCall.rawInput.imageUrls).toEqual([
      'https://cdn.example.com/master/primary.jpg',
      'https://cdn.example.com/master/extra1.jpg',
    ]);
    expect(contentCall.generationResult).toMatchObject({
      templateId: 'kids-playful',
      imageUrls: [
        'https://cdn.example.com/master/primary.jpg',
        'https://cdn.example.com/master/extra1.jpg',
      ],
      processedImages: {},
    });
    expect(mocks.contentAssets.recordDetailPageInputAssets).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      generationGroupId: CONTENT_GROUP_ID,
      createdByUserId: null,
      imageUrls: [
        'https://cdn.example.com/master/primary.jpg',
        'https://cdn.example.com/master/extra1.jpg',
      ],
    });

    // ThumbnailGeneration row created with pending + thumbnail input persisted
    expect(mocks.thumbnailGenerationCreate).toHaveBeenCalledTimes(1);
    const thumbnailCall = mocks.thumbnailGenerationCreate.mock.calls[0][0];
    expect(thumbnailCall.organizationId).toBe(ORGANIZATION_ID);
    expect(thumbnailCall.masterId).toBe(MASTER_ID);
    expect(thumbnailCall.originalUrl).toBe('https://cdn.example.com/master/primary.jpg');
    expect(thumbnailCall.inputMeta).toMatchObject({
      method: 'generate',
      trigger: 'post_promotion',
    });
    expect(thumbnailCall.inputImage.role).toBe('product');

    // Operation alerts started for both
    expect(mocks.operationAlerts.start).toHaveBeenCalledTimes(2);
    const detailAlert = mocks.operationAlerts.start.mock.calls.find(
      (call) => call[0].type === 'detail_page_generation',
    );
    expect(detailAlert).toBeDefined();
    expect(detailAlert![0].sourceType).toBe(
      AI_JOB_SOURCE_TYPES.POST_PROMOTION_DETAIL_PAGE,
    );
    expect(detailAlert![0].sourceId).toBe(CONTENT_GEN_ID);
    expect(detailAlert![0].targetId).toBe(MASTER_ID);
    expect(detailAlert![0].actorUserId).toBeNull();

    const thumbnailAlert = mocks.operationAlerts.start.mock.calls.find(
      (call) => call[0].type === 'thumbnail_edit_job',
    );
    expect(thumbnailAlert).toBeDefined();
    expect(thumbnailAlert![0].sourceType).toBe(
      AI_JOB_SOURCE_TYPES.POST_PROMOTION_THUMBNAIL,
    );
    expect(thumbnailAlert![0].sourceId).toBe(THUMBNAIL_GEN_ID);

    expect(mocks.detailPageJobs.schedule).toHaveBeenCalledTimes(1);
    const detailJob = mocks.detailPageJobs.schedule.mock.calls[0][0];
    expect(detailJob.organizationId).toBe(ORGANIZATION_ID);
    expect(detailJob.generationId).toBe(CONTENT_GEN_ID);
    expect(detailJob.generationId).not.toBe(MASTER_ID);
    const parsedDetail = DetailPageGenerateDirectInputSchema.parse(detailJob.payload);
    expect(parsedDetail.templateId).toBe('kids-playful');
    expect(parsedDetail.raw.rawTitle).toBe('Test Master');
    expect(parsedDetail.raw.rawCategory).toBe('Kids/Toys');
    expect(parsedDetail.raw.rawDescription).toBe('Lovely test toy');
    expect(parsedDetail.raw.imageUrls).toEqual([
      'https://cdn.example.com/master/primary.jpg',
      'https://cdn.example.com/master/extra1.jpg',
    ]);
    expect(parsedDetail.heroImageMode).toBe('llm-pick');

    expect(mocks.thumbnailJobs.schedule).toHaveBeenCalledTimes(1);
    const thumbnailJob = mocks.thumbnailJobs.schedule.mock.calls[0][0];
    expect(thumbnailJob.organizationId).toBe(ORGANIZATION_ID);
    expect(thumbnailJob.generationId).toBe(THUMBNAIL_GEN_ID);
    const parsedThumb = ThumbnailGenerateDirectInputSchema.parse(thumbnailJob.payload);
    expect(parsedThumb.mode).toBe('edit');
    expect(parsedThumb.inputs).toHaveLength(1);
    expect(parsedThumb.inputs[0].role).toBe('product');
    expect(parsedThumb.inputs[0].data).toBeTruthy();
  });

  it('master not found: logs error, no rows created, no direct jobs scheduled, no throw', async () => {
    mocks.repository.findMasterContext.mockResolvedValueOnce(null);
    const logger = (svc as unknown as { logger: { error: ReturnType<typeof vi.fn> } }).logger;
    const errorSpy = vi.spyOn(logger, 'error');

    await expect(svc.fireForMaster(MASTER_ID, ORGANIZATION_ID)).resolves.toBeUndefined();

    expect(mocks.contentGenerationCreate).not.toHaveBeenCalled();
    expect(mocks.thumbnailGenerationCreate).not.toHaveBeenCalled();
    expect(mocks.detailPageJobs.schedule).not.toHaveBeenCalled();
    expect(mocks.thumbnailJobs.schedule).not.toHaveBeenCalled();
    expect(mocks.operationAlerts.start).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0]).toContain('master not found');
  });

  it('detail-page direct job schedule throws: marks ContentGeneration FAILED + alert.fail + logs; thumbnail still attempts', async () => {
    mocks.detailPageJobs.schedule.mockImplementationOnce(() => {
      throw new Error('detail_schedule_down');
    });
    const logger = (svc as unknown as { logger: { error: ReturnType<typeof vi.fn> } }).logger;
    const errorSpy = vi.spyOn(logger, 'error');

    await expect(svc.fireForMaster(MASTER_ID, ORGANIZATION_ID)).resolves.toBeUndefined();

    expect(mocks.markDetailPageFailed).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      contentGenerationId: CONTENT_GEN_ID,
      errorMessage: expect.stringContaining('detail_schedule_down'),
    });
    expect(mocks.operationAlerts.fail).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      `detail-page:${CONTENT_GEN_ID}`,
      expect.objectContaining({
        message: expect.stringContaining('detail_schedule_down'),
        metadata: expect.objectContaining({
          errorCode: 'direct_ai_schedule_failed',
        }),
      }),
    );
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls.some((c) => String(c[0]).includes('detail_page_generate'))).toBe(
      true,
    );

    // Thumbnail still ran
    expect(mocks.thumbnailGenerationCreate).toHaveBeenCalledTimes(1);
    expect(mocks.thumbnailJobs.schedule).toHaveBeenCalledTimes(1);
  });

  it('detail-page asset recording throws: marks ContentGeneration FAILED + alert.fail + logs; thumbnail still attempts', async () => {
    mocks.contentAssets.recordDetailPageInputAssets.mockImplementationOnce(() => {
      throw new Error('asset_down');
    });
    const logger = (svc as unknown as { logger: { error: ReturnType<typeof vi.fn> } }).logger;
    const errorSpy = vi.spyOn(logger, 'error');

    await expect(svc.fireForMaster(MASTER_ID, ORGANIZATION_ID)).resolves.toBeUndefined();

    expect(mocks.markDetailPageFailed).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      contentGenerationId: CONTENT_GEN_ID,
      errorMessage: expect.stringContaining('asset_down'),
    });
    expect(mocks.operationAlerts.fail).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      `detail-page:${CONTENT_GEN_ID}`,
      expect.objectContaining({ message: expect.stringContaining('asset_down') }),
    );
    expect(errorSpy).toHaveBeenCalled();

    // Thumbnail still ran
    expect(mocks.thumbnailGenerationCreate).toHaveBeenCalledTimes(1);
    expect(mocks.thumbnailJobs.schedule).toHaveBeenCalledTimes(1);
  });

  it('thumbnail direct job schedule throws: detail-page already scheduled; thumbnail row marked failed and alert.fail called', async () => {
    mocks.thumbnailJobs.schedule.mockImplementationOnce(() => {
      throw new Error('thumbnail_schedule_down');
    });

    await expect(svc.fireForMaster(MASTER_ID, ORGANIZATION_ID)).resolves.toBeUndefined();

    // detail-page still ran (no failed update for detail)
    expect(mocks.contentGenerationCreate).toHaveBeenCalledTimes(1);
    expect(mocks.markDetailPageFailed).not.toHaveBeenCalled();

    expect(mocks.markThumbnailFailed).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      generationId: THUMBNAIL_GEN_ID,
      errorMessage: expect.stringContaining('thumbnail_schedule_down'),
    });
    expect(mocks.operationAlerts.fail).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      `thumbnail-edit:${THUMBNAIL_GEN_ID}`,
      expect.objectContaining({
        message: expect.stringContaining('thumbnail_schedule_down'),
      }),
    );
  });

  it('both succeed: both gen rows persisted, both alerts started, both direct jobs scheduled, no failed updates', async () => {
    await svc.fireForMaster(MASTER_ID, ORGANIZATION_ID);

    expect(mocks.contentGenerationCreate).toHaveBeenCalledTimes(1);
    expect(mocks.thumbnailGenerationCreate).toHaveBeenCalledTimes(1);
    expect(mocks.operationAlerts.start).toHaveBeenCalledTimes(2);
    expect(mocks.detailPageJobs.schedule).toHaveBeenCalledTimes(1);
    expect(mocks.thumbnailJobs.schedule).toHaveBeenCalledTimes(1);

    // No failure paths triggered
    expect(mocks.markDetailPageFailed).not.toHaveBeenCalled();
    expect(mocks.markThumbnailFailed).not.toHaveBeenCalled();
    expect(mocks.operationAlerts.fail).not.toHaveBeenCalled();
  });
});
