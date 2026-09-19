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
  SalesProductListQuerySchema,
  SalesProductOptionsReplaceInputSchema,
  SalesProductUpdateInputSchema,
  type SalesProduct,
  type SalesProductListResponse,
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
 * 판매상품 · 단품의 유일한 쓰기 길(ADR-0013). 검증은 공유 Zod 계약으로 끝내고, 셀피아 SKU 는 이 조직의
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
      data: {
        salePrice: input.salePrice ?? null,
        priceRateBp: input.priceRateBp ?? null,
        costPrice: input.costPrice ?? null,
        name: input.name ?? null,
        detailHtml: input.detailHtml ?? null,
        promoText: input.promoText ?? null,
        noticeCategory: input.noticeCategory ?? null,
        stockPercent: input.stockPercent ?? null,
        adapterValues: input.adapterValues ?? null,
        sourceRaw: null,
      },
    });
    return this.get(organizationId, salesProductId);
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
