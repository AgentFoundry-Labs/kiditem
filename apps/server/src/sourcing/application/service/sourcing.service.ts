import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { paginationParams } from '../../../common/pagination';
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
  SOURCING_CANDIDATE_REPOSITORY_PORT,
  type SourcingCandidateRepositoryPort,
} from '../port/out/repository/sourcing-candidate.repository.port';
import {
  SOURCING_CANDIDATE_CONTENT_ASSET_PORT,
  type CandidateContentAssetPort,
} from '../port/out/cross-domain/candidate-content-asset.port';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrationContentWorkspacePort,
} from '../port/in/registration-content-workspace.port';
import {
  extractSupplierOfferId,
  parseAllowedSupplierUrl,
} from '../../domain/supplier-source-url-policy';
import {
  normalizeSourcingVariantKey,
  canonicalSourcingCandidateIdentity,
} from '../../domain/sourcing-candidate-identity';
import { SourcingScrapeUrlService } from './sourcing-scrape-url.service';
import { SourcingAgentCommandService } from './sourcing-agent-command.service';
import type {
  CreateProductGenerationCommand,
  ReceiveExtensionDataInput,
  RegisterManualProductCommand,
} from '../port/in/sourcing.commands';
import type { ProductGenerationTask } from '../../../ai/application/port/in/generation/product-generation-ai-trigger.port';

const PLATFORM_MAP: Record<string, string> = {
  '1688': 'ALIBABA_1688',
  alibaba: 'ALIBABA',
  taobao: 'TAOBAO',
  tiktok: 'TIKTOK',
};

const MANUAL_PRODUCT_REGISTRATION_PLATFORM = 'KIDITEM_PRODUCT_REGISTRATION';
const COLLECTED_PRODUCT_INBOX_PLATFORMS = [
  'ALIBABA_1688',
  'ALIBABA',
  MANUAL_PRODUCT_REGISTRATION_PLATFORM,
] as const;

const PRODUCT_IMAGE_FIELD_KEYS = [
  'images', 'imageUrls', 'image_urls', 'mainImages', 'main_images',
  'mainImage', 'main_image', 'offerImgList',
] as const;

const DESCRIPTION_IMAGE_FIELD_KEYS = [
  'description_images', 'detail_images', 'images', 'imageUrls', 'image_urls',
] as const;

type FlatExtensionData = ReceiveExtensionDataInput;

@Injectable()
export class SourcingService {
  constructor(
    @Inject(SOURCING_CANDIDATE_REPOSITORY_PORT)
    private readonly candidates: SourcingCandidateRepositoryPort,
    @Inject(SOURCING_AGENT_GATEWAY_PORT)
    private readonly agentGateway: SourcingAgentGatewayPort,
    @Inject(SOURCING_CANDIDATE_CONTENT_ASSET_PORT)
    private readonly candidateContentAssets: CandidateContentAssetPort,
    @Inject(REGISTRATION_CONTENT_WORKSPACE_PORT)
    private readonly registrationContentWorkspaces: RegistrationContentWorkspacePort,
    private readonly agentCommands: SourcingAgentCommandService,
    private readonly scrapes: SourcingScrapeUrlService,
    @Optional() @Inject(SALES_PRODUCT_DRAFT_PORT)
    private readonly salesProductDrafts?: SalesProductDraftPort,
  ) {}

  async receiveExtensionData(
    data: FlatExtensionData,
    organizationId: string,
    triggeredByUserId: string | null,
  ): Promise<{ ok: boolean; message: string; product_count: number }> {
    const pageType = data.page_type || 'detail';
    const sourceUrl = this.sourceUrlFrom(data);

    if (pageType === 'detail' && data.title && sourceUrl) {
      const price = this.extractCostCny(data);
      const incomingImages = this.extractProductImageUrls(data as Record<string, unknown>);
      const platform = PLATFORM_MAP[String(data.source_platform || '').toLowerCase()] || (data.source_platform as string) || 'unknown';
      const externalOfferId = this.externalOfferIdFrom(data, sourceUrl);
      const variantKeyNormalized = this.variantKeyFrom(data);

      await this.candidates.upsertSourced({
        organizationId,
        sourceUrl,
        sourcePlatform: platform,
        externalOfferId,
        variantKeyNormalized,
        sourceIdentityHash: canonicalSourcingCandidateIdentity({
          sourcePlatform: platform,
          sourceUrl,
          validatedExternalOfferId: extractSupplierOfferId(parseAllowedSupplierUrl(sourceUrl)),
          variantKeyNormalized,
        }),
        rawData: data as Record<string, unknown>,
        name: data.title as string,
        description: (data.description as string) || '',
        category: (data.category_name as string) || null,
        tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
        thumbnailUrl: incomingImages[0] || null,
        imageUrl: incomingImages[0] || null,
        costCny: price,
        triggeredByUserId,
        images: incomingImages.map((url, index) => ({
          url,
          role: 'product',
          label: null,
          sortOrder: index,
          source: 'sourcing-extension',
          isPrimary: index === 0,
        })),
      });
      return { ok: true, message: `received detail data from ${platform}`, product_count: 1 };
    }

    if (pageType === 'description' && sourceUrl) {
      const incomingImages = this.extractDescriptionImageUrls(data as Record<string, unknown>);
      const merged = await this.candidates.mergeDescription({
        organizationId,
        sourceUrl,
        rawData: data as Record<string, unknown>,
        description: typeof data.description_text === 'string' && data.description_text.trim()
          ? data.description_text : null,
        thumbnailUrl: null,
        imageUrl: null,
        images: incomingImages.map((url, index) => ({
          url,
          role: 'detail',
          label: null,
          sortOrder: index,
          source: 'sourcing-extension-description',
          isPrimary: false,
        })),
      });
      return {
        ok: true,
        message: `received description data from ${data.source_platform}`,
        product_count: merged ? 1 : 0,
      };
    }

    if (pageType === 'search') {
      return {
        ok: true,
        message: `received search data from ${data.source_platform}`,
        product_count: Number(data.total_found || 0),
      };
    }

    return { ok: true, message: 'received', product_count: 0 };
  }

  async registerManualProduct(
    data: RegisterManualProductCommand,
    organizationId: string,
    triggeredByUserId: string | null,
  ) {
    return this.agentCommands.registerManualProduct(data, organizationId, triggeredByUserId);
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

  async quickProcessCandidate(
    candidateId: string,
    organizationId: string,
    triggeredByUserId: string | null,
    task: ProductGenerationTask,
    idempotencyKey: string,
  ) {
    const requestHash = canonicalOwnerInputHash({
      kind: 'sourcing.quick_process',
      candidateId,
      task,
    });
    const candidate = await this.candidates.findById(candidateId, organizationId);
    if (!candidate) throw new NotFoundException('Sourcing candidate not found');
    try {
      const receipt = await this.candidates.claimQuickProcessCandidate({
        organizationId,
        candidateId,
        idempotencyKey,
        requestHash,
      });
      if (receipt.candidateId !== candidate.id) {
        throw new ConflictException('product_generation_idempotency_conflict');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'owner_idempotency_input_conflict') {
        throw new ConflictException('product_generation_idempotency_conflict');
      }
      throw error;
    }

    const rawData = this.plainRecord(candidate.rawData);
    const candidateImageUrls = candidate.images
      .filter((image) => image.role === 'product')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((image) => image.url);
    const fallbackImageUrls = [
      ...this.extractProductImageUrls(rawData),
      candidate.imageUrl ?? '',
      candidate.thumbnailUrl ?? '',
    ];
    const imageUrls = this.uniqueNonEmptyStrings(
      candidateImageUrls.length > 0 ? candidateImageUrls : fallbackImageUrls,
    );
    const rawOptionNames = this.stringArrayFromUnknown(rawData.optionNames ?? rawData.options);
    const optionNames = this.uniqueNonEmptyStrings([
      ...rawOptionNames,
      ...this.stringArrayFromUnknown(candidate.tags),
    ]);
    const target = typeof rawData.target === 'string' ? rawData.target : null;

    const ai = await this.agentGateway.startProductGeneration({
      organizationId,
      triggeredByUserId,
      idempotencyKey,
      requestHash,
      candidateId,
      productName: candidate.name,
      category: candidate.category,
      description: candidate.description,
      target,
      imageUrls,
      thumbnailUrl: candidate.thumbnailUrl ?? imageUrls[0] ?? null,
      optionNames,
      templateId: 'bold-vertical',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      kcCertificationNumber: null,
      productSize: null,
      colorVariantStatus: 'auto',
      colorVariantNames: null,
      boxSetStatus: 'auto',
      boxSetQuantity: null,
      task,
    });

    return {
      ok: true,
      message: quickProcessMessage(task),
      product_count: 1,
      candidateId: ai.candidateId,
      href: ai.href,
      detailGenerationId: ai.detailGenerationId,
      thumbnailGenerationId: ai.thumbnailGenerationId,
      contentWorkspaceId: ai.contentWorkspaceId,
    };
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

  async listProducts(
    query: { page?: string | number; limit?: string | number; platform?: string; sort?: string },
    organizationId: string,
  ) {
    const { page, limit } = paginationParams(query);
    const sort = query.sort === 'oldest' ? 'oldest' : query.sort === 'name_asc' ? 'name_asc' : 'newest';
    const platform = query.platform ? (PLATFORM_MAP[query.platform.toLowerCase()] || query.platform) : undefined;
    const listed = await this.candidates.listSourced({
      organizationId,
      page,
      limit,
      sort,
      platform,
      sourcePlatforms: platform ? undefined : [...COLLECTED_PRODUCT_INBOX_PLATFORMS],
    });
    // 카드가 보여줄 **저장된 대표 썸네일**. `sourcing_candidates.thumbnail_url` 은
    // 수집 원본이라 대표를 바꿔 저장해도 그대로다 — 대표는 준비(RegistrationTarget)
    // 또는 후보 워크스페이스가 소유한다. 상세(`getProduct`)와 같은 우선순위를 쓴다:
    // 준비가 이기고, 없으면 워크스페이스 선택이다.
    //
    // 후보 원본 URL 은 덮어쓰지 않고 별도 필드로 내보낸다. 원본은 그대로 남아야
    // 하고, 조용한 대체는 어떤 이미지가 왜 보이는지를 지운다.
    //
    // 페이지 전체를 한 번에 읽는다. 후보별 조회는 N+1 이다.
    const workspaceThumbnails = await this.candidateContentAssets.findCurrentThumbnails({
      organizationId,
      sourceCandidateIds: listed.items.map((item) => item.id),
    });
    return {
      ...listed,
      items: listed.items.map((item) => ({
        ...item,
        selectedThumbnailUrl:
          item.registrationTarget?.selectedThumbnailUrl
          ?? workspaceThumbnails.get(item.id)?.url
          ?? null,
      })),
    };
  }

  async getProduct(productId: string, organizationId: string) {
    const row = await this.candidates.findById(productId, organizationId);
    if (!row) throw new NotFoundException('Sourcing candidate not found');
    // Registration images come from ContentAsset.role, not from the scrape
    // originals on the candidate row. Missing assets stay empty so the caller
    // can fall back explicitly instead of shipping an off-spec source image.
    const [registrationMedia, contentWorkspaceId, salesProductId] = await Promise.all([
      // 갤러리와 현재 대표를 하나의 미디어 읽기로 받아, 응답 중간에
      // 선택이 바뀌어도 등록 이미지와 `등록 대표` 배지가 엇갈리지 않게 한다.
      this.candidateContentAssets.loadRegistrationMedia({
        organizationId,
        sourceCandidateId: productId,
      }),
      // 후보가 이미 가진 content workspace. 없으면 null 이고, 읽기 경로에서
      // 새로 만들지 않는다. 워크스페이스 화면은 이 값이 있어야 썸네일 구성을
      // 저장할 수 있다.
      this.registrationContentWorkspaces.findCandidateWorkspaceId({
        organizationId,
        sourceCandidateId: productId,
      }),
      // 편집 정본은 이 후보에서 만든 판매상품 초안이다(KID-310). 화면은 이 id 로 넘어간다.
      this.salesProductDrafts?.findDraftIdForSource(organizationId, productId) ?? null,
    ]);
    const {
      registrationImages,
      currentThumbnail: workspaceThumbnailSelection,
    } = registrationMedia;
    return {
      ...row,
      contentWorkspaceId,
      salesProductId,
      registrationImages,
      currentThumbnail: workspaceThumbnailSelection,
    };
  }

  // ── helpers ──
  private extractCostCny(data: FlatExtensionData): number | null {
    if (data.price != null) {
      const p = typeof data.price === 'number' ? data.price : parseFloat(String(data.price));
      if (!isNaN(p) && p > 0) return p;
    }
    if (typeof data.priceRange === 'string' && data.priceRange.includes('-')) {
      const min = parseFloat(data.priceRange.split('-')[0]);
      if (!isNaN(min) && min > 0) return min;
    }
    for (const value of [data.price_min, data.price_max]) {
      const price = typeof value === 'number' ? value : parseFloat(String(value));
      if (Number.isFinite(price) && price > 0) return price;
    }
    const offer = data.offer as Record<string, unknown> | undefined;
    if (offer?.price != null) {
      const p = parseFloat(String(offer.price));
      if (!isNaN(p) && p > 0) return p;
    }
    if (Array.isArray(data.skuProps)) {
      const prices = (data.skuProps as Array<Record<string, unknown>>)
        .map((s) => parseFloat(String(s?.price)))
        .filter((p) => !isNaN(p) && p > 0);
      if (prices.length > 0) return Math.min(...prices);
    }
    for (const tiers of [data.price_tiers, data.priceRanges]) {
      if (!Array.isArray(tiers)) continue;
      const prices = tiers
        .map((tier) => {
          if (!tier || typeof tier !== 'object') return null;
          const row = tier as Record<string, unknown>;
          return parseFloat(String(row.price ?? row.priceCny ?? row.price_min));
        })
        .filter((price): price is number => (
          price !== null && Number.isFinite(price) && price > 0
        ));
      if (prices.length > 0) return Math.min(...prices);
    }
    return null;
  }

  private normalizeImageUrl(value: unknown): string | null {
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
        const normalized = this.normalizeImageUrl(obj[key]);
        if (normalized) return normalized;
      }
    }
    return null;
  }

  private collectImageUrls(values: unknown[]): string[] {
    const urls: string[] = [];
    const push = (value: unknown) => {
      if (Array.isArray(value)) { for (const item of value) push(item); return; }
      const normalized = this.normalizeImageUrl(value);
      if (normalized) urls.push(normalized);
    };
    for (const value of values) push(value);
    return [...new Set(urls)];
  }

  private uniqueNonEmptyStrings(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private stringArrayFromUnknown(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  }

  private plainRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  private extractProductImageUrls(data: Record<string, unknown>): string[] {
    return this.collectImageUrls(PRODUCT_IMAGE_FIELD_KEYS.map((key) => data[key]));
  }

  private extractDescriptionImageUrls(data: Record<string, unknown>): string[] {
    return this.collectImageUrls(DESCRIPTION_IMAGE_FIELD_KEYS.map((key) => data[key]));
  }

  private sourceUrlFrom(data: FlatExtensionData): string | null {
    if (typeof data.source_url !== 'string' || !data.source_url.trim()) return null;
    try {
      return parseAllowedSupplierUrl(data.source_url).normalizedUrl;
    } catch {
      throw new BadRequestException('지원하지 않는 공급사 상품 URL입니다.');
    }
  }

  private externalOfferIdFrom(data: FlatExtensionData, sourceUrl: string): string | null {
    if (typeof data.product_id === 'string' && data.product_id.trim()) {
      return data.product_id.trim();
    }
    return extractSupplierOfferId(parseAllowedSupplierUrl(sourceUrl));
  }

  private variantKeyFrom(data: FlatExtensionData): string {
    return normalizeSourcingVariantKey(
      (data as Record<string, unknown>).variant_key,
    );
  }
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
