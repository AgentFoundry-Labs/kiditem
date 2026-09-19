import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SalesProductChannelOverrideInputSchema,
  SalesProductCreateInputSchema,
  SalesProductDemoteRequestSchema,
  SalesProductFromCandidatesRequestSchema,
  SalesProductListQuerySchema,
  SalesProductOptionsReplaceInputSchema,
  SalesProductUpdateInputSchema,
  type SalesProduct,
  type SalesProductFromCandidatesResult,
  type SalesProductListResponse,
  type SalesProductMallCategories,
} from '@kiditem/shared/sales-product';
import {
  planSalesProductOptionReplacement,
  SalesProductOptionPlanError,
  type SalesProductOptionDraft,
} from '../../domain/sales-product';
import {
  SALES_PRODUCT_REPOSITORY_PORT,
  type SalesProductBasicsRecord,
  type SalesProductRepositoryPort,
} from '../port/out/repository/sales-product.repository.port';

/** 사람이 만든 판매상품코드 머리. 사방넷에서 옮긴 상품은 숫자 품번코드를 그대로 쓴다. */
export const SALES_PRODUCT_CODE_PREFIX = 'K';

const VERSION_CONFLICT = '다른 곳에서 먼저 고쳤습니다. 새로 불러온 뒤 다시 저장하세요.';

/**
 * 판매상품 · 단품의 유일한 쓰기 길(ADR-0014). 검증은 공유 Zod 계약으로 끝내고, 셀피아 SKU 는 이 조직의
 * 활성 SKU 인지 확인한 뒤에만 단품 구성으로 받는다. 구성은 선언일 뿐 채널 레시피를 건드리지 않는다.
 */
@Injectable()
export class SalesProductService {
  constructor(
    @Inject(SALES_PRODUCT_REPOSITORY_PORT)
    private readonly repository: SalesProductRepositoryPort,
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
      option.components.map((component) => component.sellpiaInventorySkuId)));
    const code = input.code ?? await this.nextProductCode(organizationId);
    const plan = planOrBadRequest(() => planSalesProductOptionReplacement({
      productCode: code,
      existing: [],
      options: input.options.map(toDraft),
    }));
    const id = await this.repository.create(organizationId, {
      ...basicsRecord(input),
      code,
      sabangnetGoodsNo: null,
      optionAxes: input.optionAxes,
      sourceRaw: null,
    }, plan);
    return this.get(organizationId, id);
  }

  /**
   * 수집상품 여러 개를 판매상품으로 만든다(수집상품 화면의 몰 대량등록). 같은 수집상품에서 만든 판매상품이 있으면 새로
   * 만들지 않고 그것을 쓴다 — 사람이 고친 값은 덮지 않고, 비어 있는 사진 · 상세설명만 채운다.
   */
  async createFromCandidates(organizationId: string, body: unknown): Promise<SalesProductFromCandidatesResult> {
    const input = parseOrBadRequest(SalesProductFromCandidatesRequestSchema, body, '수집상품 내용이 올바르지 않습니다.');
    const candidateIds = input.items.map((item) => item.candidateId);
    if (new Set(candidateIds).size !== candidateIds.length) throw new BadRequestException('같은 수집상품이 두 번 있습니다.');
    await this.assertSellpiaSkus(organizationId, input.items.flatMap((item) =>
      item.product.options.flatMap((option) => option.components.map((component) => component.sellpiaInventorySkuId))));
    const existing = await this.repository.findBySourceCandidates(organizationId, candidateIds);
    const products: SalesProductFromCandidatesResult['products'] = [];
    for (const item of input.items) {
      const found = existing.get(item.candidateId);
      if (found) {
        const patch: Partial<SalesProductBasicsRecord> = {};
        if (found.imageUrls.length === 0 && item.product.imageUrls.length > 0) patch.imageUrls = item.product.imageUrls;
        if (!found.detailHtml?.trim() && item.product.detailHtml?.trim()) patch.detailHtml = item.product.detailHtml;
        // 수집상품으로 되돌렸던 판매상품은 다시 올리면 같은 코드 · 몰별 값 그대로 되살아난다.
        if (found.status === 'archived') patch.status = 'active';
        const updated = Object.keys(patch).length > 0
          ? await this.repository.updateBasics(organizationId, found.id, found.version, patch)
          : true;
        // 그사이 사람이 고쳤으면(버전이 다르면) 채우지 않는다. 되살려야 하는데 못 했으면 다시 누르게 한다.
        if (!updated && patch.status) throw new ConflictException(VERSION_CONFLICT);
        products.push({ candidateId: item.candidateId, salesProductId: found.id, code: found.code, created: false });
        continue;
      }
      const code = await this.nextProductCode(organizationId);
      const plan = planOrBadRequest(() => planSalesProductOptionReplacement({
        productCode: code,
        existing: [],
        options: item.product.options.map(toDraft),
      }));
      try {
        const id = await this.repository.create(organizationId, {
          ...basicsRecord(item.product),
          code,
          sabangnetGoodsNo: null,
          optionAxes: item.product.optionAxes,
          sourceRaw: null,
          sourceCandidateId: item.candidateId,
        }, plan);
        products.push({ candidateId: item.candidateId, salesProductId: id, code, created: true });
      } catch (error) {
        // 같은 수집상품을 다른 곳에서 먼저 만들었으면 그것을 쓴다.
        const made = (await this.repository.findBySourceCandidates(organizationId, [item.candidateId])).get(item.candidateId);
        if (!made) throw error;
        products.push({ candidateId: item.candidateId, salesProductId: made.id, code: made.code, created: false });
      }
    }
    return {
      products,
      created: products.filter((product) => product.created).length,
      reused: products.filter((product) => !product.created).length,
    };
  }

  /**
   * 수집상품으로 되돌리기 — 수집상품에서 만든 판매상품만, 몰에 올라간 상품과 이어져 있지 않을 때 `archived` 로 내린다.
   * 지우지 않는다: 코드 · 몰별 값이 남아 같은 수집상품을 다시 올리면 그대로 되살아나고, 코드가 다른 상품에 다시 쓰이지 않는다.
   */
  async demoteToCandidate(organizationId: string, salesProductId: string, body: unknown): Promise<SalesProduct> {
    const input = parseOrBadRequest(SalesProductDemoteRequestSchema, body, '버전이 필요합니다.');
    const product = await this.get(organizationId, salesProductId);
    if (!product.sourceCandidateId) {
      throw new BadRequestException('수집상품에서 만든 판매상품만 수집상품으로 되돌릴 수 있습니다.');
    }
    const linkedListings = product.channelListings.filter((listing) => listing.isActive).length;
    const linkedOptions = product.options.reduce((sum, option) => sum + option.linkedChannelOptionCount, 0);
    if (linkedListings > 0 || linkedOptions > 0) {
      throw new ConflictException('몰에 올라간 상품과 이어져 있어 되돌릴 수 없습니다. 몰에서 내리고 연결을 끊은 뒤 되돌리세요.');
    }
    if (product.status === 'archived') return product;
    const updated = await this.repository.updateBasics(organizationId, salesProductId, input.expectedVersion, { status: 'archived' });
    if (!updated) throw new ConflictException(VERSION_CONFLICT);
    return this.get(organizationId, salesProductId);
  }

  async update(organizationId: string, salesProductId: string, body: unknown): Promise<SalesProduct> {
    const input = parseOrBadRequest(SalesProductUpdateInputSchema, body, '판매상품 내용이 올바르지 않습니다.');
    const { expectedVersion, ...patch } = input;
    const updated = await this.repository.updateBasics(
      organizationId,
      salesProductId,
      expectedVersion,
      patch as Partial<SalesProductBasicsRecord>,
    );
    if (!updated) throw new ConflictException(VERSION_CONFLICT);
    return this.get(organizationId, salesProductId);
  }

  async replaceOptions(organizationId: string, salesProductId: string, body: unknown): Promise<SalesProduct> {
    const input = parseOrBadRequest(SalesProductOptionsReplaceInputSchema, body, '옵션 내용이 올바르지 않습니다.');
    await this.assertSellpiaSkus(organizationId, input.options.flatMap((option) =>
      option.components.map((component) => component.sellpiaInventorySkuId)));
    const state = await this.repository.readOptionState(organizationId, salesProductId);
    if (!state) throw new NotFoundException('판매상품을 찾지 못했습니다.');
    if (state.version !== input.expectedVersion) throw new ConflictException(VERSION_CONFLICT);
    const plan = planOrBadRequest(() => planSalesProductOptionReplacement({
      productCode: state.productCode,
      existing: state.options,
      options: input.options.map(toDraft),
    }));
    const applied = await this.repository.applyOptionPlan({
      organizationId,
      salesProductId,
      expectedVersion: input.expectedVersion,
      optionAxes: input.optionAxes,
      plan,
    });
    if (!applied) throw new ConflictException(VERSION_CONFLICT);
    return this.get(organizationId, salesProductId);
  }

  async upsertChannelOverride(
    organizationId: string,
    salesProductId: string,
    channelAccountId: string,
    body: unknown,
  ): Promise<SalesProduct> {
    const input = parseOrBadRequest(SalesProductChannelOverrideInputSchema, body, '몰별 값이 올바르지 않습니다.');
    await this.repository.upsertChannelOverride({
      organizationId,
      salesProductId,
      channelAccountId,
      // 보낸 칸만 바꾼다(null 은 비움). 보내지 않은 칸 — 사방넷에서 옮긴 상세 · 원가 · 고시 · 분류 · 원문 — 은 지킨다.
      data: {
        salePrice: input.salePrice,
        priceRateBp: input.priceRateBp,
        costPrice: input.costPrice,
        name: input.name,
        detailHtml: input.detailHtml,
        promoText: input.promoText,
        noticeCategory: input.noticeCategory,
        stockPercent: input.stockPercent,
        adapterValues: input.adapterValues,
      },
    });
    return this.get(organizationId, salesProductId);
  }

  async mallCategories(organizationId: string, mallKey: string): Promise<SalesProductMallCategories> {
    return { mallKey, categories: await this.repository.listMallCategories(organizationId, mallKey) };
  }

  async deleteChannelOverride(
    organizationId: string,
    salesProductId: string,
    channelAccountId: string,
  ): Promise<SalesProduct> {
    await this.repository.deleteChannelOverride({ organizationId, salesProductId, channelAccountId });
    return this.get(organizationId, salesProductId);
  }

  private async assertSellpiaSkus(organizationId: string, skuIds: readonly string[]): Promise<void> {
    const invalid = await this.repository.findInvalidSellpiaSkuIds(organizationId, skuIds);
    if (invalid.length > 0) {
      throw new BadRequestException({
        message: '셀피아 상품을 찾지 못했거나 쓰지 않는 상품입니다.',
        sellpiaInventorySkuIds: invalid,
      });
    }
  }

  private async nextProductCode(organizationId: string): Promise<string> {
    const codes = await this.repository.listCodesWithPrefix(organizationId, SALES_PRODUCT_CODE_PREFIX);
    const used = codes
      .map((code) => Number(code.slice(SALES_PRODUCT_CODE_PREFIX.length)))
      .filter((value) => Number.isInteger(value) && value > 0);
    const next = (used.length ? Math.max(...used) : 0) + 1;
    return `${SALES_PRODUCT_CODE_PREFIX}${String(next).padStart(6, '0')}`;
  }
}

function toDraft(option: {
  id?: string;
  optionCode?: string;
  values: string[];
  alias?: string | null;
  barcode?: string | null;
  extraPrice: number;
  supplyStatus: SalesProductOptionDraft['supplyStatus'];
  safetyStock?: number | null;
  components: { sellpiaInventorySkuId: string; quantity: number }[];
}): SalesProductOptionDraft {
  return { ...option };
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
  status: SalesProductBasicsRecord['status'];
  taxType: SalesProductBasicsRecord['taxType'];
  deliveryFeeType?: SalesProductBasicsRecord['deliveryFeeType'];
  deliveryFee?: number | null;
  costPrice?: number | null;
  salePrice: number;
  tagPrice?: number | null;
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
    status: input.status,
    taxType: input.taxType,
    deliveryFeeType: input.deliveryFeeType ?? null,
    deliveryFee: input.deliveryFee ?? null,
    costPrice: input.costPrice ?? null,
    salePrice: input.salePrice,
    tagPrice: input.tagPrice ?? null,
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
