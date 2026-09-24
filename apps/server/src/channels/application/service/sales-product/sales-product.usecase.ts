import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { SalesProductThumbnailSourcePort } from '../../port/out/ai/sales-product-thumbnail-source.port';
import type {
  SalesProductDraftDeletionResult,
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
  clampDraftText,
  planDraftOptions,
} from '../../../domain/sales-product/sales-product-draft';
import {
  SalesProductStatusError,
  draftDeletion,
  statusAfterArchive,
  type DraftDeletionBlock,
} from '../../../domain/sales-product/sales-product-status';
import type { ChannelSourceRecordPort } from '../../port/out/sourcing/source-record.port';
import type { RegistrationStatePort } from '../../port/in/registration-state.port';
import { issueSalesProductOptionCodes } from './sales-product-code';
import type { SalesProductWorkspaceArchivePort } from '../../port/out/ai/sales-product-workspace-archive.port';
import {
  SALES_PRODUCT_REPOSITORY_PORT,
  type SalesProductBasicsRecord,
  type SalesProductRepositoryPort,
} from '../../port/out/persistence/sales-product.repository.port';

const VERSION_CONFLICT = '다른 곳에서 먼저 고쳤습니다. 새로 불러온 뒤 다시 저장하세요.';

/** 초안 삭제를 막는 이유마다 운영자에게 보이는 문장. 판매 상품은 지우지 않고 보관한다(KID-313). */
const DRAFT_DELETION_REFUSALS: Record<DraftDeletionBlock, string> = {
  not_draft: '판매 중인 상품이라 지우지 않고 보관합니다.',
  listing: '몰 상품과 이어져 있어 초안을 지우지 않았습니다.',
  live_execution: '등록 실행이 남아 있어 초안을 지우지 않았습니다.',
};

/**
 * Channels 판매상품 · 옵션의 쓰기 계약(ADR-0020). 공유 입력 계약을 검증하고 원천 상품은
 * 같은 조직에 존재하는지 확인한 뒤에만 구성으로 받는다. 구성은 선언일 뿐 채널 레시피를 건드리지 않는다.
 */

export class SalesProductUseCase implements SalesProductPort {
  constructor(

    private readonly repository: SalesProductRepositoryPort,
    /** 초안 삭제가 콘텐츠 작업공간 보관과 원본 기록 삭제를 한 커밋에 묶는다 — 빠지면 삭제가 반쪽이 된다. */
    private readonly workspaceArchive: SalesProductWorkspaceArchivePort,
    private readonly sourceRecords: ChannelSourceRecordPort,
    /** 목록 줄의 계정별 등록 상태 — 하나뿐인 등록 상태 reader 로 한 쪽을 한 번에 읽는다(KID-320). */
    private readonly registrationStates: RegistrationStatePort,
    private readonly thumbnails?: SalesProductThumbnailSourcePort,
  ) {}

  /**
   * 목록 줄의 사진은 운영자가 저장한 대표 썸네일이 있으면 그것, 없으면 초안의 첫 사진이다. 계정별 등록 상태는
   * 등록 상태 reader 가 쪽 전체를 한 번에 읽는다 — 목록 질의가 실행 표를 조합하지 않는다.
   */
  async list(organizationId: string, rawQuery: unknown): Promise<SalesProductListResponse> {
    const query = parseOrBadRequest(SalesProductListQuerySchema, rawQuery, '목록 조건이 올바르지 않습니다.');
    const page = await this.repository.list(organizationId, query);
    if (page.items.length === 0) return { ...page, items: [] };
    const ids = page.items.map((item) => item.id);
    const [states, representatives] = await Promise.all([
      this.registrationStates.readForSalesProducts(organizationId, ids),
      this.thumbnails ? this.thumbnails.findRepresentativeThumbnailUrls(organizationId, ids) : new Map<string, string>(),
    ]);
    return {
      ...page,
      items: page.items.map((item) => ({
        ...item,
        imageUrl: representatives.get(item.id) ?? item.imageUrl,
        registrationAccounts: states.get(item.id)?.accounts ?? [],
      })),
    };
  }

  async get(
    organizationId: string,
    salesProductId: string,
    transaction?: OwnerTransaction,
  ): Promise<SalesProduct> {
    const product = await this.repository.get(organizationId, salesProductId, transaction);
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
    // 직접 작성은 팔려고 만드는 것이다 — 삽입과 KID 발급이 한 트랜잭션이다(KID-313). 시퀀스가 없으면
    // 발급이 503 으로 던지고 삽입도 되돌아가, 코드 없는 판매 상품이 남지 않는다.
    const id = await this.repository.runInTransaction(async (transaction) => {
      const created = await this.repository.create(organizationId, {
        ...basicsRecord({ ...input, status: 'draft' }),
        code: null,
        sabangnetGoodsNo: null,
        optionAxes: input.optionAxes,
        sourceRaw: null,
      }, plan, transaction);
      await this.repository.ensureCodes(organizationId, created, transaction);
      return created;
    });
    return this.get(organizationId, id);
  }

  /**
   * KID 발급의 단일 진입점. 팔기로 정한 순간에만 부른다 — 첫 등록 설정, 몰 엑셀 파일,
   * 직접 작성(ADR-0022). 멱등이다.
   */
  ensureSalesProductCodes(organizationId: string, salesProductId: string): Promise<{ code: string; issued: number }> {
    return this.repository.ensureCodes(organizationId, salesProductId);
  }

  /**
   * 초안 하나를 만든다 — 수집 · 직접 작성이 같은 문으로 들어온다(KID-313).
   *
   * 원본 하나에 초안 하나는 Sourcing 의 입장 규칙과 `(organization, source_record_id)` 유일키가
   * 지킨다. 원본 기록에서 온 초안은 원본을 입장시킨 트랜잭션(`transaction`)에서 만든다 — 초안을 만들지
   * 못하면 원본 기록도 되돌아가, 초안 없는 원본 기록이 생기지 않는다.
   *
   * 화면 입력과 달리 원천 값은 칸 너비를 지킨 적이 없다 — 1688 이름은 흔히 255 자를 넘는다. 거절하면
   * 그 상품을 담을 수 없으므로 칸 너비로 자른다. 원가와 원문은 복사하지 않는다(원본 기록에서 읽는다).
   */
  async createDraft(
    organizationId: string,
    input: SalesProductDraftSource,
    transaction?: OwnerTransaction,
  ): Promise<string> {
    const name = clampDraftText('name', input.name).value ?? '';
    const sourcePlatform = clampDraftText('sourcePlatform', input.sourcePlatform).value;
    const { optionAxes, optionValues } = planDraftOptions(input.optionNames);
    const plan = planOrBadRequest(() => planSalesProductOptionReplacement({
      productCode: '',
      existing: [],
      options: optionValues.map((values) => ({
        values,
        // 수집 초안은 판매가가 없다. 직접 작성은 사람이 적은 값을 받는다.
        salePrice: input.salePrice ?? null,
        normalPrice: input.normalPrice ?? null,
        supplyStatus: 'selling' as const,
        components: [],
      })),
    }));
    const basics = input.basics ?? {};
    return this.repository.create(organizationId, {
      ...basicsRecord({
        name,
        description: input.description ?? '',
        keywords: (basics.keywords ?? []).map((keyword) => keyword.slice(0, 60)).slice(0, 30),
        standardCategory: clampDraftText('standardCategory', basics.standardCategory).value,
        targetAudience: clampDraftText('targetAudience', basics.targetAudience).value,
        ageGroup: clampDraftText('ageGroup', basics.ageGroup).value,
        productSize: clampDraftText('productSize', basics.productSize).value,
        colorVariantNames: (basics.colorVariantNames ?? []).map((color) => color.slice(0, 60)).slice(0, 30),
        boxSetQuantity: basics.boxSetQuantity ?? null,
        brand: clampDraftText('brand', basics.brand).value,
        manufacturer: clampDraftText('manufacturer', basics.manufacturer).value,
        originCountry: clampDraftText('originCountry', basics.originCountry).value,
        modelName: clampDraftText('modelName', basics.modelName).value,
        kcStatus: basics.kcStatus ?? 'unknown',
        ownCode: basics.ownCode?.trim().slice(0, 100) || null,
        status: 'draft',
        taxType: basics.taxType ?? 'taxable',
        deliveryFeeType: basics.deliveryFeeType ?? null,
        deliveryFee: basics.deliveryFee ?? null,
        stockManaged: false,
        imageUrls: [...(input.imageUrls ?? [])].slice(0, 30),
        noticeValues: [],
        certifications: (basics.certifications ?? []).slice(0, 10).map((certification) => ({
          number: certification.number.slice(0, 100),
          issuer: certification.issuer?.slice(0, 100) ?? null,
          field: certification.field?.slice(0, 100) ?? null,
        })),
      }),
      // 초안은 코드가 없다. 팔기로 정할 때(첫 등록 설정 · 몰 엑셀) 발급하고, 그때 active 가 된다.
      code: null,
      sabangnetGoodsNo: null,
      optionAxes,
      // sourceRaw 는 사방넷 마지막 가져오기 원문 자리다 — 수집 원본은 원본 기록에 있다(KID-313).
      sourceRaw: null,
      sourceRecordId: input.sourceRecordId,
      sourcePlatform,
      sourceUrl: input.sourceUrl ?? null,
    }, plan, transaction);
  }

  findForSourceRecord(
    organizationId: string,
    sourceRecordId: string,
    transaction?: OwnerTransaction,
  ): Promise<{ salesProductId: string; status: SalesProductStatus } | null> {
    return this.repository.findForSourceRecord(organizationId, sourceRecordId, transaction);
  }

  /**
   * 초안을 지운다(KID-313). 초안만 지울 수 있고 판매 상품은 보관한다. 몰 상품이나 살아 있는 등록
   * 실행이 딸린 초안도 지우지 않는다.
   *
   * 한 트랜잭션에서 초안 줄 · 옵션 · 등록 설정 · 공개 사진을 지우고, 콘텐츠 작업공간을 정리하고,
   * 원본 기록을 지운다 — 그래야 같은 원본의 재수집이 새 수집이 된다.
   */
  async deleteDraft(organizationId: string, salesProductId: string): Promise<SalesProductDraftDeletionResult> {
    await this.repository.runInTransaction(async (transaction) => {
      const facts = await this.repository.readDraftDeletionFacts(transaction, organizationId, salesProductId);
      if (!facts) throw new NotFoundException('판매상품을 찾지 못했습니다.');
      const decision = draftDeletion(facts);
      if (!decision.allowed) {
        throw new ConflictException({ message: DRAFT_DELETION_REFUSALS[decision.reason], reason: decision.reason });
      }
      await this.repository.deleteDraftRows(transaction, organizationId, salesProductId);
      await this.workspaceArchive.archiveSalesProductWorkspace(transaction, {
        organizationId,
        salesProductId,
        archivedAt: new Date(),
      });
      if (facts.sourceRecordId) {
        await this.sourceRecords.deleteForDraft(transaction, { organizationId, sourceRecordId: facts.sourceRecordId });
      }
    });
    return { salesProductId, deleted: true };
  }

  async update(organizationId: string, salesProductId: string, body: unknown): Promise<SalesProduct> {
    const input = parseOrBadRequest(SalesProductUpdateInputSchema, body, '판매상품 내용이 올바르지 않습니다.');
    const { expectedVersion, status, ...patch } = input;
    const state = await this.repository.readOptionState(organizationId, salesProductId);
    if (!state) throw new NotFoundException('판매상품을 찾지 못했습니다.');
    // 화면이 바꿀 수 있는 상태는 보관뿐이다(KID-313). 초안은 보관하지 않고 지운다.
    const nextStatus = status === 'archived'
      ? statusOrConflict(() => statusAfterArchive({ name: state.productName, status: state.status }))
      : undefined;
    const updated = await this.repository.updateBasics(
      organizationId,
      salesProductId,
      expectedVersion,
      {
        ...(patch as Partial<SalesProductBasicsRecord>),
        ...(nextStatus ? { status: nextStatus } : {}),
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
    // 아직 코드가 없는 초안은 팔기로 정할 때까지 비워 둔다(ADR-0022).
    if (state.productCode) await issueSalesProductOptionCodes(organizationId, plan, this.repository);
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

function statusOrConflict<T>(decide: () => T): T {
  try {
    return decide();
  } catch (error) {
    if (error instanceof SalesProductStatusError) throw new ConflictException(error.message);
    throw error;
  }
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
  noticeCategory?: string | null;
  noticeValues: string[];
  certifications: SalesProductBasicsRecord['certifications'];
  kcStatus?: SalesProductBasicsRecord['kcStatus'];
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
    noticeCategory: input.noticeCategory ?? null,
    noticeValues: input.noticeValues,
    certifications: input.certifications,
    kcStatus: input.kcStatus ?? 'unknown',
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
