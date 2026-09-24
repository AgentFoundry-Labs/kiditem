import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SALES_PRODUCT_DRAFT_PORT,
  type SalesProductDraftPort,
} from '../port/out/cross-domain/sales-product-draft.port';
import { canonicalOwnerInputHash } from '../../../common/owner-idempotency-key';
import {
  SOURCING_AGENT_GATEWAY_PORT,
  type SourcingAgentGatewayPort,
} from '../port/out/runtime/sourcing-agent.gateway.port';
import {
  SOURCE_RECORD_REPOSITORY_PORT,
  type SourceRecordRepositoryPort,
} from '../port/out/repository/source-record.repository.port';
import {
  SOURCE_RECORD_PORT,
  type SourceRecordPort,
} from '../port/in/source-record.port';
import { SourcingScrapeUrlService } from './sourcing-scrape-url.service';
import { SourcingAgentCommandService } from './sourcing-agent-command.service';
import type {
  CreateProductGenerationCommand,
  RegisterManualProductCommand,
} from '../port/in/sourcing.commands';
import type { ProductGenerationTask } from '../../../content/application/port/in/generation/product-generation-ai-trigger.port';
import type { DetailPageTemplateId } from '@kiditem/shared/ai';

const PRODUCT_IMAGE_FIELD_KEYS = [
  'images', 'imageUrls', 'image_urls', 'mainImages', 'main_images',
  'mainImage', 'main_image', 'offerImgList',
] as const;

@Injectable()
export class SourcingService {
  constructor(
    @Inject(SOURCE_RECORD_REPOSITORY_PORT)
    private readonly records: SourceRecordRepositoryPort,
    @Inject(SOURCE_RECORD_PORT)
    private readonly sourceRecords: SourceRecordPort,
    @Inject(SOURCING_AGENT_GATEWAY_PORT)
    private readonly agentGateway: SourcingAgentGatewayPort,
    private readonly agentCommands: SourcingAgentCommandService,
    private readonly scrapes: SourcingScrapeUrlService,
    @Inject(SALES_PRODUCT_DRAFT_PORT)
    private readonly salesProductDrafts: SalesProductDraftPort,
  ) {}

  async registerManualProduct(
    data: RegisterManualProductCommand,
    organizationId: string,
  ) {
    return this.agentCommands.registerManualProduct(data, organizationId);
  }

  async createProductGeneration(
    data: CreateProductGenerationCommand,
    organizationId: string,
    triggeredByUserId: string | null,
    idempotencyKey: string,
  ) {
    return this.agentCommands.createProductGeneration(
      data,
      organizationId,
      triggeredByUserId,
      {
        idempotencyKey,
        requestHash: canonicalOwnerInputHash({
          kind: 'sourcing.product_generation',
          command: definedCommandFields(data),
        }),
      },
    );
  }

  /**
   * 판매상품 초안의 콘텐츠 생성을 시작한다.
   *
   * 편집 정본은 초안이므로 생성이 쓰는 값은 모두 초안에서 온다(KID-310 · ADR-0022). 원본 기록은
   * 초안이 아직 비워 둔 자리를 메우는 데만 쓰고, 직접 작성한 초안에는 원본 기록이 아예 없다 — 그래도
   * 생성은 시작된다.
   */
  async startProductGeneration(
    salesProductId: string,
    organizationId: string,
    triggeredByUserId: string | null,
    task: ProductGenerationTask,
    idempotencyKey: string,
    templateId: DetailPageTemplateId = 'bold-vertical',
  ) {
    const requestHash = canonicalOwnerInputHash({
      kind: 'sourcing.quick_process',
      salesProductId,
      task,
      templateId,
    });
    const draft = await this.requireDraft(organizationId, salesProductId);
    try {
      const receipt = await this.records.claimQuickProcess({
        organizationId,
        salesProductId,
        idempotencyKey,
        requestHash,
      });
      if (receipt.salesProductId !== salesProductId) {
        throw new ConflictException('product_generation_idempotency_conflict');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'owner_idempotency_input_conflict') {
        throw new ConflictException('product_generation_idempotency_conflict');
      }
      throw error;
    }

    const source = draft.sourceRecordId
      ? await this.sourceRecords.read({ organizationId, sourceRecordId: draft.sourceRecordId })
      : null;
    const rawData = source?.rawData ?? {};
    const sourceImageUrls = (source?.images ?? [])
      .filter((image) => image.role === 'product')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((image) => image.url);
    const imageUrls = uniqueNonEmptyStrings(
      sourceImageUrls.length > 0 ? sourceImageUrls : extractProductImageUrls(rawData),
    );
    const optionNames = uniqueNonEmptyStrings(stringArrayFromUnknown(rawData.optionNames ?? rawData.options));

    const ai = await this.agentGateway.startProductGeneration({
      organizationId,
      triggeredByUserId,
      idempotencyKey,
      requestHash,
      salesProductId,
      // Content 의 생성 출처 칸(`sourceCandidateId`)이 원본 기록 id 를 받는다 — 이름은 W3 가 바꾼다.
      sourceCandidateId: draft.sourceRecordId,
      productBrief: {
        productName: draft.name || source?.name || '',
        category: draft.standardCategory ?? source?.category ?? null,
        description: draft.description || source?.description || '',
        target: draft.targetAudience ?? (typeof rawData.target === 'string' ? rawData.target : null),
        imageUrls: draft.imageUrls.length > 0 ? draft.imageUrls : imageUrls,
        thumbnailUrl: draft.imageUrls[0] ?? imageUrls[0] ?? null,
        optionNames: draft.optionAxes.length > 0 ? draft.optionAxes : optionNames,
        productSize: draft.productSize,
        colorVariantStatus: 'auto',
        colorVariantNames: draft.colorVariantNames,
        boxSetStatus: 'auto',
        boxSetQuantity: draft.boxSetQuantity,
      },
      templateId,
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      // KC 는 초안이 말한다 — 'none' 이면 인증 문서 없이도 송신을 통과한다(KID-310).
      kcCertificationStatus: draft.kcStatus,
      kcCertificationNumber: null,
      task,
    });

    return {
      ok: true,
      message: quickProcessMessage(task),
      product_count: 1,
      sourceRecordId: draft.sourceRecordId,
      salesProductId: ai.salesProductId,
      href: ai.href,
      detailPageId: ai.detailPageId,
      thumbnailGenerationId: ai.thumbnailGenerationId,
      contentWorkspaceId: ai.contentWorkspaceId,
    };
  }

  /** 생성 대상 초안. 없으면 생성할 것도 없다. */
  private async requireDraft(organizationId: string, salesProductId: string) {
    const draft = await this.salesProductDrafts.getDraft(organizationId, salesProductId);
    if (!draft) throw new NotFoundException('판매상품 초안을 찾지 못했습니다.');
    return draft;
  }

  async scrapeUrl(
    url: string,
    organizationId: string,
    triggeredByUserId: string | null,
    idempotencyKey: string,
  ) {
    return this.scrapes.collect({ organizationId, userId: triggeredByUserId, sourceUrl: url, idempotencyKey });
  }

  async scrapeUrlStatus(url: string, organizationId: string) {
    return this.scrapes.status(organizationId, url);
  }
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stringArrayFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeImageUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return null;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['url', 'src', 'imageUrl', 'image_url', 'fullPathImageURI', 'fullPathImageUrl']) {
      const normalized = normalizeImageUrl(obj[key]);
      if (normalized) return normalized;
    }
  }
  return null;
}

function extractProductImageUrls(data: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const push = (value: unknown) => {
    if (Array.isArray(value)) { for (const item of value) push(item); return; }
    const normalized = normalizeImageUrl(value);
    if (normalized) urls.push(normalized);
  };
  for (const key of PRODUCT_IMAGE_FIELD_KEYS) push(data[key]);
  return [...new Set(urls)];
}

function definedCommandFields(data: CreateProductGenerationCommand): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}

function quickProcessMessage(task: ProductGenerationTask): string {
  if (task === 'detail') return '상세페이지 생성 작업이 시작되었습니다.';
  if (task === 'thumbnail') return '썸네일 생성 작업이 시작되었습니다.';
  return 'AI 간편 처리 작업이 시작되었습니다.';
}
