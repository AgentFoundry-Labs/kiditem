import type {
  SalesProductDraftRetireResult,
  SalesProductDraftSource,
  SalesProductPort,
} from '../../port/in/sales-product.port';
import { ChannelInputError as BadRequestException, ChannelConflictError as ConflictException, ChannelNotFoundError as NotFoundException } from '../../../domain/exception/channel-business-error';
import {
  SalesProductCreateInputSchema,
  SalesProductListQuerySchema,
  SalesProductOptionsReplaceInputSchema,
  SalesProductUpdateInputSchema,
  type SalesProduct,
  type SalesProductListResponse,
  type SalesProductMallCategories,
  type SalesProductStatus,
} from '@kiditem/shared/sales-product';
import {
  planSalesProductOptionReplacement,
  SalesProductOptionPlanError,
  type SalesProductOptionDraft,
} from '../../../domain/sales-product/sales-product';
import {
  planDraftOptions,
  resolveSalesProductStatus,
  type SalesProductPricedOption,
} from '../../../domain/sales-product/sales-product-draft';
import { issuesKidCodes } from '../../../domain/sales-product/sales-product-code';
import { issueSalesProductOptionCodes } from './sales-product-code';
import type { SalesProductWorkspaceArchivePort } from '../../port/out/ai/sales-product-workspace-archive.port';
import {
  SALES_PRODUCT_REPOSITORY_PORT,
  type SalesProductBasicsRecord,
  type SalesProductRepositoryPort,
} from '../../port/out/persistence/sales-product.repository.port';

const VERSION_CONFLICT = '다른 곳에서 먼저 고쳤습니다. 새로 불러온 뒤 다시 저장하세요.';

/**
 * Channels 판매상품 · 옵션의 쓰기 계약(ADR-0020). 공유 입력 계약을 검증하고 원천 상품은
 * 같은 조직에 존재하는지 확인한 뒤에만 구성으로 받는다. 구성은 선언일 뿐 채널 레시피를 건드리지 않는다.
 */

export class SalesProductUseCase implements SalesProductPort {
  constructor(

    private readonly repository: SalesProductRepositoryPort,
    private readonly workspaceArchive?: SalesProductWorkspaceArchivePort,
  ) {}

  list(organizationId: string, rawQuery: unknown): Promise<SalesProductListResponse> {
    const query = parseOrBadRequest(SalesProductListQuerySchema, rawQuery, '목록 조건이 올바르지 않습니다.');
    return this.repository.list(organizationId, query);
  }

  async get(organizationId: string, salesProductId: string): Promise<SalesProduct> {
    const product = await this.repository.get(organizationId, salesProductId);
    if (!product) throw new NotFoundException('판매상품을 찾지 못했습니다.');
    return product;
  }

  async create(organizationId: string, body: unknown): Promise<SalesProduct> {
    const input = parseOrBadRequest(SalesProductCreateInputSchema, body, '판매상품 내용이 올바르지 않습니다.');
    await this.assertSellpiaSkus(organizationId, input.options.flatMap((option) =>
      option.components.map((component) => component.masterProductId)));
    const plan = planOrBadRequest(() => planSalesProductOptionReplacement({
      productCode: '',
      existing: [],
      options: input.options.map(toDraft),
    }));
    const id = await this.repository.create(organizationId, {
      ...basicsRecord(input),
      // 판매가를 다 채우지 않은 채로 만들면 초안이다. 저장할 때마다 같은 규칙으로 다시 판정한다.
      status: resolveSalesProductStatus({ current: input.status ?? 'active', options: plan.writes }),
      code: null,
      sabangnetGoodsNo: null,
      optionAxes: input.optionAxes,
      sourceRaw: null,
    }, plan);
    // 직접 작성은 팔려고 만드는 것이다 — 만드는 순간이 곧 판매 결정이라 여기서 KID 를 발급한다.
    await this.ensureSalesProductCodes(organizationId, id);
    return this.get(organizationId, id);
  }

  /** KID 발급의 단일 진입점. 발급 시점은 `KID_ISSUE_MOMENT` 하나가 정한다. */
  async ensureSalesProductCodes(organizationId: string, salesProductId: string): Promise<{ code: string; issued: number }> {
    if (!issuesKidCodes('sale_decided')) {
      throw new Error('KID 발급 시점이 바뀌었습니다. ensureSalesProductCodes 를 부르는 자리를 함께 옮기세요.');
    }
    return this.repository.ensureCodes(organizationId, salesProductId);
  }

  /**
   * 원천 한 줄에서 초안을 만든다(수집 · 직접 작성이 같은 모델로 들어온다).
   *
   * 후보 하나에 초안 하나다 — 같은 후보를 다시 담아도, 두 요청이 동시에 들어와도 초안은 늘어나지
   * 않는다. 원천 값은 초안의 첫 내용일 뿐이라 사람이 고친 뒤에는 덮지 않는다.
   */
  async createFromSource(organizationId: string, input: SalesProductDraftSource): Promise<SalesProduct> {
    const existing = await this.repository.findIdBySourceCandidate(organizationId, input.candidateId);
    if (existing) return this.get(organizationId, existing);
    const { optionAxes, optionValues } = planDraftOptions(input.optionNames);
    const plan = planOrBadRequest(() => planSalesProductOptionReplacement({
      productCode: '',
      existing: [],
      options: optionValues.map((values) => ({
        values,
        // 초안은 판매가가 없다. 사람이 채우면 그 저장이 상품을 active 로 올린다.
        salePrice: null,
        normalPrice: null,
        supplyStatus: 'selling' as const,
        components: [],
      })),
    }));
    try {
      const id = await this.repository.create(organizationId, {
        ...basicsRecord({
          name: input.name,
          description: input.description ?? '',
          keywords: [],
          status: 'draft',
          taxType: 'taxable',
          stockManaged: false,
          imageUrls: [...(input.imageUrls ?? [])],
          extraDetailHtml: [],
          noticeValues: [],
          certifications: [],
        }),
        status: 'draft',
        // 수집 초안은 코드 없이 만든다. 팔기로 정할 때(첫 등록 설정 · 몰 엑셀) 발급한다.
        code: null,
        sabangnetGoodsNo: null,
        optionAxes,
        sourceRaw: sourceSnapshot(input),
        sourceCandidateId: input.candidateId,
        sourcePlatform: input.sourcePlatform ?? null,
        sourceUrl: input.sourceUrl ?? null,
      }, plan);
      return this.get(organizationId, id);
    } catch (error) {
      // 같은 후보로 다른 요청이 먼저 만들었으면(유일키 충돌) 그것을 쓴다.
      const made = await this.repository.findIdBySourceCandidate(organizationId, input.candidateId);
      if (!made) throw error;
      return this.get(organizationId, made);
    }
  }

  findDraftIdForSource(organizationId: string, candidateId: string): Promise<string | null> {
    return this.repository.findIdBySourceCandidate(organizationId, candidateId);
  }

  findDraftIdsForSources(
    organizationId: string,
    candidateIds: readonly string[],
  ): Promise<Map<string, string>> {
    return this.repository.findIdsBySourceCandidates(organizationId, candidateIds);
  }

  /**
   * 후보를 거절 · 삭제했을 때 그 초안을 `unused` 로 내린다.
   *
   * 몰에 올라가 있거나 살아 있는 등록 실행이 있으면 초안을 그대로 두고 이유만 돌려준다 — 후보
   * 거절을 막지 않는다(몰에 있는 상품의 기준을 잃으면 수정 · 품절을 어디에 걸지 모른다).
   */
  async retireDraftForSource(organizationId: string, candidateId: string): Promise<SalesProductDraftRetireResult> {
    const row = await this.repository.retireDraftForSource(organizationId, candidateId);
    if (row.salesProductId === null || row.retired) {
      // 초안을 더 쓰지 않으면 그 콘텐츠 작업공간도 함께 보관한다 — 남겨 두면 지운 상품의 작업물이
      // 화면에 계속 뜬다.
      if (row.retired && row.salesProductId) {
        await this.workspaceArchive?.archiveSalesProductWorkspace({
          organizationId,
          salesProductId: row.salesProductId,
          archivedAt: new Date(),
        });
      }
      return { salesProductId: row.salesProductId, retired: row.retired, blockedReason: null };
    }
    return {
      salesProductId: row.salesProductId,
      retired: false,
      blockedReason: row.activeListingCount > 0
        ? '몰에 올라가 있어 판매상품을 미사용으로 내리지 않았습니다.'
        : '등록 실행이 남아 있어 판매상품을 미사용으로 내리지 않았습니다.',
    };
  }

  async update(organizationId: string, salesProductId: string, body: unknown): Promise<SalesProduct> {
    const input = parseOrBadRequest(SalesProductUpdateInputSchema, body, '판매상품 내용이 올바르지 않습니다.');
    const { expectedVersion, ...patch } = input;
    const state = await this.repository.readOptionState(organizationId, salesProductId);
    if (!state) throw new NotFoundException('판매상품을 찾지 못했습니다.');
    const updated = await this.repository.updateBasics(
      organizationId,
      salesProductId,
      expectedVersion,
      {
        ...(patch as Partial<SalesProductBasicsRecord>),
        // 기본 칸만 고쳐도 상태는 옵션 판매가가 정한다.
        status: resolveSalesProductStatus({
          current: (patch.status as SalesProductStatus | undefined) ?? state.status,
          options: pricedOptions(state.options),
        }),
      },
    );
    if (!updated) throw new ConflictException(VERSION_CONFLICT);
    return this.get(organizationId, salesProductId);
  }

  async replaceOptions(organizationId: string, salesProductId: string, body: unknown): Promise<SalesProduct> {
    const input = parseOrBadRequest(SalesProductOptionsReplaceInputSchema, body, '옵션 내용이 올바르지 않습니다.');
    await this.assertSellpiaSkus(organizationId, input.options.flatMap((option) =>
      option.components.map((component) => component.masterProductId)));
    const state = await this.repository.readOptionState(organizationId, salesProductId);
    if (!state) throw new NotFoundException('판매상품을 찾지 못했습니다.');
    if (state.version !== input.expectedVersion) throw new ConflictException(VERSION_CONFLICT);
    const plan = planOrBadRequest(() => planSalesProductOptionReplacement({
      productCode: state.productCode,
      existing: state.options,
      options: input.options.map(toDraft),
    }));
    // 이미 팔기로 정한 상품(KID 가 있는 상품)에 새 단품을 더하면 그 자리에서 번호를 준다.
    // 아직 코드가 없는 초안은 발급 시점(`KID_ISSUE_MOMENT`)까지 비워 둔다.
    if (state.productCode) await issueSalesProductOptionCodes(organizationId, plan, this.repository);
    const applied = await this.repository.applyOptionPlan({
      organizationId,
      salesProductId,
      expectedVersion: input.expectedVersion,
      optionAxes: input.optionAxes,
      plan,
      // 저장이 곧 "판매가 확인"이다 — 팔 옵션에 값이 다 차면 여기서 active 로 올라간다.
      status: resolveSalesProductStatus({ current: state.status, options: plan.writes }),
    });
    if (!applied) throw new ConflictException(VERSION_CONFLICT);
    return this.get(organizationId, salesProductId);
  }

  async mallCategories(organizationId: string, mallKey: string): Promise<SalesProductMallCategories> {
    return { mallKey, categories: await this.repository.listMallCategories(organizationId, mallKey) } satisfies SalesProductMallCategories;
  }

  private async assertSellpiaSkus(organizationId: string, skuIds: readonly string[]): Promise<void> {
    const invalid = await this.repository.findInvalidMasterProductIds(organizationId, skuIds);
    if (invalid.length > 0) {
      throw new BadRequestException({
        message: '셀피아 상품을 찾지 못했거나 쓰지 않는 상품입니다.',
        masterProductIds: invalid,
      });
    }
  }


}

function toDraft(option: {
  id?: string;
  optionCode?: string;
  values: string[];
  alias?: string | null;
  barcode?: string | null;
  salePrice: number | null;
  normalPrice: number | null;
  supplyStatus: SalesProductOptionDraft['supplyStatus'];
  safetyStock?: number | null;
  components: { masterProductId: string; quantity: number }[];
}): SalesProductOptionDraft {
  return { ...option };
}

function pricedOptions(
  options: readonly { supplyStatus?: string; salePrice?: number | null; id: string }[],
): SalesProductPricedOption[] {
  return options.map((option) => ({
    id: option.id,
    supplyStatus: (option.supplyStatus ?? 'selling') as SalesProductPricedOption['supplyStatus'],
    salePrice: option.salePrice ?? null,
  }));
}

/** 원천 원문(원가 위안 포함)을 초안에 얼려 둔다. 편집 화면은 읽지 않는다. */
function sourceSnapshot(input: SalesProductDraftSource): Record<string, unknown> | null {
  const raw = { ...(input.rawBasics ?? {}) };
  if (input.costCny !== undefined && input.costCny !== null) raw.costCny = input.costCny;
  return Object.keys(raw).length > 0 ? raw : null;
}

function basicsRecord(input: {
  name: string;
  ownCode?: string | null;
  shortName?: string | null;
  englishName?: string | null;
  printName?: string | null;
  modelName?: string | null;
  modelNo?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  originCountry?: string | null;
  originRegion?: string | null;
  keywords: string[];
  standardCategory?: string | null;
  description?: string;
  targetAudience?: string | null;
  ageGroup?: string | null;
  productSize?: string | null;
  colorVariantNames?: string[];
  boxSetQuantity?: number | null;
  registrationDefaults?: Record<string, unknown> | null;
  status: SalesProductBasicsRecord['status'];
  taxType: SalesProductBasicsRecord['taxType'];
  deliveryFeeType?: SalesProductBasicsRecord['deliveryFeeType'];
  deliveryFee?: number | null;
  stockManaged: boolean;
  imageUrls: string[];
  detailHtml?: string | null;
  extraDetailHtml: string[];
  noticeCategory?: string | null;
  noticeValues: string[];
  certifications: SalesProductBasicsRecord['certifications'];
  importDeclarationNo?: string | null;
  adminMemo?: string | null;
}): SalesProductBasicsRecord {
  return {
    name: input.name,
    ownCode: input.ownCode ?? null,
    shortName: input.shortName ?? null,
    englishName: input.englishName ?? null,
    printName: input.printName ?? null,
    modelName: input.modelName ?? null,
    modelNo: input.modelNo ?? null,
    brand: input.brand ?? null,
    manufacturer: input.manufacturer ?? null,
    originCountry: input.originCountry ?? null,
    originRegion: input.originRegion ?? null,
    keywords: input.keywords,
    standardCategory: input.standardCategory ?? null,
    description: input.description ?? '',
    targetAudience: input.targetAudience ?? null,
    ageGroup: input.ageGroup ?? null,
    productSize: input.productSize ?? null,
    colorVariantNames: input.colorVariantNames ?? [],
    boxSetQuantity: input.boxSetQuantity ?? null,
    registrationDefaults: input.registrationDefaults ?? null,
    status: input.status,
    taxType: input.taxType,
    deliveryFeeType: input.deliveryFeeType ?? null,
    deliveryFee: input.deliveryFee ?? null,
    stockManaged: input.stockManaged,
    imageUrls: input.imageUrls,
    detailHtml: input.detailHtml ?? null,
    extraDetailHtml: input.extraDetailHtml,
    noticeCategory: input.noticeCategory ?? null,
    noticeValues: input.noticeValues,
    certifications: input.certifications,
    importDeclarationNo: input.importDeclarationNo ?? null,
    adminMemo: input.adminMemo ?? null,
  };
}

function planOrBadRequest<T>(plan: () => T): T {
  try {
    return plan();
  } catch (error) {
    if (error instanceof SalesProductOptionPlanError) throw new BadRequestException(error.message);
    throw error;
  }
}

export function parseOrBadRequest<T>(
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false; error: { flatten(): unknown } } },
  input: unknown,
  message: string,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException({ message, errors: parsed.error.flatten() });
  return parsed.data;
}
