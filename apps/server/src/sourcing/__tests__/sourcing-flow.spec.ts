import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourcingService } from '../application/service/sourcing.service';
import { SourcingAgentCommandService } from '../application/service/sourcing-agent-command.service';
import { canonicalOwnerInputHash } from '../../common/owner-idempotency-key';

const OWNER_TX = { owner: true };

/** 원본 기록 저장소. 직접 작성은 원본 기록 없이 초안만 만드는 트랜잭션 · 영수증을 쓴다(KID-313). */
function makeRecords() {
  return {
    runInTransaction: vi.fn(async (work: (transaction: unknown) => Promise<unknown>) => work(OWNER_TX)),
    runOnce: vi.fn(async (_receipt: unknown, work: (transaction: unknown) => Promise<unknown>) => work(OWNER_TX)),
    claimQuickProcess: vi.fn().mockResolvedValue({ salesProductId: DRAFT_ID }),
    read: vi.fn().mockResolvedValue(null),
  };
}

function makeGateway() {
  return {
    registerUploadedDetailPage: vi.fn(),
    startProductGeneration: vi.fn().mockResolvedValue({
      salesProductId: DRAFT_ID,
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      contentWorkspaceId: 'workspace-1',
      href: `/product-pipeline/collected-products/${DRAFT_ID}`,
    }),
  };
}

/** 초안은 Channels 가 만든다. Sourcing 은 초안 계약만 부른다. */
function makeDrafts() {
  return {
    findForSourceRecord: vi.fn().mockResolvedValue(null),
    createDraft: vi.fn().mockResolvedValue({ salesProductId: DRAFT_ID }),
    getDraft: vi.fn().mockResolvedValue(draftRow()),
  };
}

const DRAFT_ID = 'draft-1';
const SOURCE_RECORD_ID = 'source-record-1';

/** 생성 prompt 가 읽는 초안 한 줄. 원본 원문이 아니라 여기 값이 정본이다. */
function draftRow() {
  return {
    id: DRAFT_ID,
    name: '자석 다트게임',
    standardCategory: '완구',
    description: '안전한 다트 보드',
    targetAudience: '초등학생',
    imageUrls: ['https://example.com/main.jpg'],
    optionAxes: ['기본'],
    productSize: null,
    colorVariantNames: [],
    boxSetQuantity: null,
    kcStatus: 'unknown' as const,
    sourceRecordId: SOURCE_RECORD_ID,
  };
}

describe('SourcingService — drafts without a source record, and generation from a draft', () => {
  let service: SourcingService;
  let records: ReturnType<typeof makeRecords>;
  let gateway: ReturnType<typeof makeGateway>;
  let drafts: ReturnType<typeof makeDrafts>;

  beforeEach(() => {
    records = makeRecords();
    gateway = makeGateway();
    drafts = makeDrafts();
    const agentCommands = new SourcingAgentCommandService(records as any, gateway as any, drafts as any);
    service = new SourcingService(
      records as any,
      records as any,
      gateway as any,
      agentCommands,
      {} as any,
      drafts as any,
    );
  });

  it('manual product registration makes a draft with no source record, carrying what the operator typed', async () => {
    const result = await service.registerManualProduct(
      {
        title: '바삭바삭 수제왁스팝',
        category: '완구',
        description: '말랑한 촉감 놀이 상품',
        target: '부모 구매자',
        thumbnailUrl: 'https://cdn.example.com/2.jpg',
        imageUrls: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
        optionNames: ['노란색', '분홍색'],
        salePrice: 9900,
        brand: '키드아이템',
      },
      'org-1',
    );

    expect(drafts.createDraft).toHaveBeenCalledWith(OWNER_TX, 'org-1', expect.objectContaining({
      sourceRecordId: null,
      sourcePlatform: 'KIDITEM_PRODUCT_REGISTRATION',
      name: '바삭바삭 수제왁스팝',
      description: '말랑한 촉감 놀이 상품',
      // 대표로 고른 사진이 첫 사진이다.
      imageUrls: ['https://cdn.example.com/2.jpg', 'https://cdn.example.com/1.jpg'],
      optionNames: ['노란색', '분홍색'],
      salePrice: 9900,
      basics: expect.objectContaining({ standardCategory: '완구', targetAudience: '부모 구매자', brand: '키드아이템' }),
    }));
    expect(result).toMatchObject({
      ok: true,
      product_count: 1,
      salesProductId: DRAFT_ID,
      href: `/product-pipeline/collected-products/${DRAFT_ID}`,
    });
  });

  it('createProductGeneration makes one draft under the owner receipt and delegates AI generation without a source record', async () => {
    gateway.startProductGeneration.mockResolvedValueOnce({
      salesProductId: DRAFT_ID,
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      contentWorkspaceId: 'workspace-1',
      href: `/product-pipeline/collected-products/${DRAFT_ID}`,
    });

    const result = await service.createProductGeneration({
      title: '자석 다트게임',
      category: '완구',
      description: '안전한 다트 보드',
      target: '초등학생',
      thumbnailUrl: 'https://example.com/main.jpg',
      imageUrls: ['https://example.com/main.jpg'],
      optionNames: ['기본'],
      templateId: 'bold-vertical',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      productSize: '높이: 30cm',
    }, 'org-1', 'user-1', 'product-generation-key');

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      salesProductId: DRAFT_ID,
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
    }));
    expect(records.runOnce).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      capabilityKey: 'sourcing.product_generation',
      idempotencyKey: 'product-generation-key',
    }), expect.any(Function));
    expect(drafts.createDraft).toHaveBeenCalledWith(OWNER_TX, 'org-1', expect.objectContaining({
      sourceRecordId: null, sourcePlatform: 'KIDITEM_PRODUCT_REGISTRATION', name: '자석 다트게임',
    }));
    expect(gateway.startProductGeneration).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      salesProductId: DRAFT_ID,
      sourceCandidateId: null,
      productBrief: expect.objectContaining({
        productName: '자석 다트게임',
        imageUrls: ['https://example.com/main.jpg'],
      }),
      idempotencyKey: 'product-generation-key',
      requestHash: canonicalOwnerInputHash({
        kind: 'sourcing.product_generation',
        command: {
          title: '자석 다트게임',
          category: '완구',
          description: '안전한 다트 보드',
          target: '초등학생',
          thumbnailUrl: 'https://example.com/main.jpg',
          imageUrls: ['https://example.com/main.jpg'],
          optionNames: ['기본'],
          templateId: 'bold-vertical',
          ageGroup: 'age-8-plus',
          detailImageCount: '2',
          usageSectionMode: 'include',
          kcCertificationStatus: 'unknown',
          productSize: '높이: 30cm',
        },
      }),
    }));
  });

  it('startProductGeneration delegates generation for an existing draft and reads its source record only through the owner port', async () => {
    gateway.startProductGeneration.mockResolvedValueOnce({
      salesProductId: DRAFT_ID,
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      contentWorkspaceId: 'workspace-1',
      href: `/product-pipeline/collected-products/${DRAFT_ID}`,
    });

    const result = await service.startProductGeneration(
      DRAFT_ID,
      'org-1',
      'user-1',
      'all',
      'quick-process-key',
    );

    expect(drafts.createDraft).not.toHaveBeenCalled();
    expect(records.read).toHaveBeenCalledWith({ organizationId: 'org-1', sourceRecordId: SOURCE_RECORD_ID });
    expect(records.claimQuickProcess).toHaveBeenCalledWith({
      organizationId: 'org-1',
      salesProductId: DRAFT_ID,
      idempotencyKey: 'quick-process-key',
      requestHash: canonicalOwnerInputHash({
        kind: 'sourcing.quick_process',
        salesProductId: DRAFT_ID,
        task: 'all',
        templateId: 'bold-vertical',
      }),
    });
    expect(gateway.startProductGeneration).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      salesProductId: DRAFT_ID,
      sourceCandidateId: SOURCE_RECORD_ID,
      productBrief: expect.objectContaining({
        productName: '자석 다트게임',
        category: '완구',
        description: '안전한 다트 보드',
        target: '초등학생',
        imageUrls: ['https://example.com/main.jpg'],
        thumbnailUrl: 'https://example.com/main.jpg',
        optionNames: ['기본'],
      }),
      templateId: 'bold-vertical',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      task: 'all',
      idempotencyKey: 'quick-process-key',
      requestHash: canonicalOwnerInputHash({
        kind: 'sourcing.quick_process',
        salesProductId: DRAFT_ID,
        task: 'all',
        templateId: 'bold-vertical',
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      sourceRecordId: SOURCE_RECORD_ID,
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
    }));
  });

  /**
   * 직접 작성한 초안에는 원천 기록이 없다. 편집 정본이 초안이므로 생성이 쓸 값은 다 있고,
   * 후보를 못 찾았다고 생성이 막히면 안 된다(KID-310 · ADR-0022).
   */
  it('⭐ 원본 기록 없는 직접 작성 초안도 생성을 시작한다', async () => {
    drafts.getDraft.mockResolvedValueOnce({ ...draftRow(), sourceRecordId: null });
    gateway.startProductGeneration.mockResolvedValueOnce({
      salesProductId: DRAFT_ID,
      detailGenerationId: 'detail-1',
      thumbnailGenerationId: 'thumb-1',
      contentWorkspaceId: 'workspace-1',
      href: `/product-hub/sales-products/${DRAFT_ID}`,
    });

    const result = await service.startProductGeneration(
      DRAFT_ID, 'org-1', 'user-1', 'all', 'direct-key',
    );

    // 원본 기록을 아예 찾지 않는다 — 찾을 것이 없다.
    expect(records.read).not.toHaveBeenCalled();
    expect(gateway.startProductGeneration).toHaveBeenCalledWith(expect.objectContaining({
      salesProductId: DRAFT_ID,
      sourceCandidateId: null,
      productBrief: expect.objectContaining({ productName: '자석 다트게임' }),
    }));
    expect(result).toMatchObject({ ok: true, sourceRecordId: null, salesProductId: DRAFT_ID });
  });

  it('rejects quick-process hash drift before starting direct AI work', async () => {
    records.claimQuickProcess.mockRejectedValueOnce(
      new Error('owner_idempotency_input_conflict'),
    );

    await expect(service.startProductGeneration(
      DRAFT_ID,
      'org-1',
      'user-1',
      'thumbnail',
      'quick-process-key',
    )).rejects.toMatchObject({
      status: 409,
      message: 'product_generation_idempotency_conflict',
    });
    expect(gateway.startProductGeneration).not.toHaveBeenCalled();
  });

  it('startProductGeneration can request only thumbnail generation', async () => {
    gateway.startProductGeneration.mockResolvedValueOnce({
      salesProductId: DRAFT_ID,
      detailGenerationId: null,
      thumbnailGenerationId: 'thumb-1',
      contentWorkspaceId: null,
      href: `/product-pipeline/collected-products/${DRAFT_ID}`,
    });

    await service.startProductGeneration(
      DRAFT_ID,
      'org-1',
      'user-1',
      'thumbnail',
      'quick-process-thumbnail-key',
    );

    expect(gateway.startProductGeneration).toHaveBeenCalledWith(expect.objectContaining({
      salesProductId: DRAFT_ID,
      sourceCandidateId: SOURCE_RECORD_ID,
      task: 'thumbnail',
      idempotencyKey: 'quick-process-thumbnail-key',
      templateId: 'bold-vertical',
    }));

    gateway.startProductGeneration.mockResolvedValueOnce({
      salesProductId: DRAFT_ID,
      detailGenerationId: 'detail-2',
      thumbnailGenerationId: null,
      contentWorkspaceId: 'workspace-1',
      href: `/product-pipeline/collected-products/${DRAFT_ID}`,
    });
    await service.startProductGeneration(
      DRAFT_ID,
      'org-1',
      'user-1',
      'detail',
      'template-change-key',
      'kids-playful',
    );
    expect(gateway.startProductGeneration).toHaveBeenLastCalledWith(expect.objectContaining({
      task: 'detail',
      templateId: 'kids-playful',
    }));
    expect(records.claimQuickProcess).toHaveBeenLastCalledWith(expect.objectContaining({
      requestHash: canonicalOwnerInputHash({
        kind: 'sourcing.quick_process',
        salesProductId: DRAFT_ID,
        task: 'detail',
        templateId: 'kids-playful',
      }),
    }));
  });
});
