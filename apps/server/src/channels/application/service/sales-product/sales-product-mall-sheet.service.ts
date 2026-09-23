import type { SalesProductMallSheetPort, MallSheetFile } from "../../port/in/sales-product/sales-product-mall-sheet.port";
export type { MallSheetFile } from "../../port/in/sales-product/sales-product-mall-sheet.port";
import type { ChannelActivityPort } from '../../port/out/alerts/channel-activity.port';
import { ChannelInputError as BadRequestException, ChannelNotFoundError as NotFoundException } from '../../../domain/exception/channel-business-error';
import {
  SalesProductDraftError,
  requireConfirmedPrice,
} from '../../../domain/sales-product/sales-product-draft';
import {
  SALES_PRODUCT_SABANGNET_VALUE_KEYS,
  SalesProductMallCategoryAssignRequestSchema,
  SalesProductMallSheetRequestSchema,
  SalesProductPublicImagePendingRequestSchema,
  SalesProductPublicImageSaveRequestSchema,
  type SalesProductMallCategoryAssignResult,
  type SalesProductPublicImagePending,
  type SalesProductMallSheetCategory,
  type SalesProductMallSheetCategoryList,
  type SalesProductMallSheetCheck,
  type SalesProductMallSheetList,
  type SalesProductMallSheetRequest,
} from '@kiditem/shared/sales-product';
import {
  isPublicImageUrl,
  missingFixedFields,
  resolveFixedValues,
  type MallBulkSheetSpec,
  type MallSheetContext,
  type MallSheetRow,
  type MallSheetRowsResult,
} from '../../../domain/registration/bulk-sheet/mall-bulk-sheet';
import {
  findMallBulkSheet,
  MALL_BULK_SHEET_UNAVAILABLE,
  MALL_BULK_SHEETS,
} from '../../../domain/registration/bulk-sheet/mall-bulk-sheet-registry';
import { MallCategoryLookup } from '../../../domain/registration/bulk-sheet/mall-sheet-categories';
import { MallCategorySuggester } from '../../../domain/registration/bulk-sheet/mall-category-suggestions';
import {
  pendingPublicImages,
  privateImageUrls,
  toMallSheetProduct,
  unreadableSheetImages,
  type MallSheetSourceProduct,
} from '../../../domain/registration/bulk-sheet/mall-sheet-product';
import {
  SALES_PRODUCT_REPOSITORY_PORT,
  type SalesProductRepositoryPort,
} from '../../port/out/persistence/sales-product.repository.port';
import type { ChannelRegistrableDetailPagePort } from '../../port/out/content/registrable-detail-page.port';
import {
  MALL_BULK_SHEET_FILES_PORT,
  type MallBulkSheetFilesPort,
} from '../../port/out/storage/mall-bulk-sheet-files.port';

const CONTENT_TYPE: Record<MallBulkSheetSpec['template']['bookType'], string> = {
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  csv: 'text/csv; charset=utf-8',
};

interface SheetContext extends MallSheetContext {
  /** 우리 저장소 주소 → 몰이 읽는 공개 복사본. */
  publicCopies: ReadonlyMap<string, string>;
}

/**
 * 판매상품 → 몰 대량등록 엑셀(ADR-0014). 몰 양식은 몰마다 다르고, 몰 규칙(`MALL_BULK_SHEETS`)이 판매상품 한 건을 그
 * 몰 행으로 바꾼다. 먼저 `check` 로 무엇이 들어가고 무엇이 막히는지 보이고, 사람이 고른 상품으로 `file` 을 만든다.
 * 파일을 만드는 것은 등록이 아니다 — 사람이 몰 판매자센터에 올리고, 몰 상품을 다시 가져와야 등록을 안다.
 */

export class SalesProductMallSheetService implements SalesProductMallSheetPort {


  constructor(

    private readonly repository: SalesProductRepositoryPort,

    private readonly files: MallBulkSheetFilesPort,
    private readonly logger: ChannelActivityPort,
    private readonly detailPages: ChannelRegistrableDetailPagePort,
  ) {}

  /**
   * 판매상품과 그 상세. 상세 HTML 은 Content 의 현재 상세 revision 에서 상품마다 한 번 읽는다(KID-313 W2) —
   * 몰별 상세 override 는 없다. revision 이 없는 상품은 상세가 비어 몰 규칙이 "상세설명이 비어 있습니다" 로 막는다.
   */
  private async readSources(organizationId: string, salesProductIds: readonly string[]): Promise<MallSheetSourceProduct[]> {
    const products = await this.repository.readMallSheetProducts(organizationId, salesProductIds);
    const details = await this.detailPages.readMany({
      organizationId,
      products: products.map((product) => ({ salesProductId: product.id, selectedDetailPageRevisionId: null })),
    });
    return products.map((product) => ({ ...product, detailHtml: details.get(product.id)?.html || null }));
  }

  list(): SalesProductMallSheetList {
    return {
      sheets: MALL_BULK_SHEETS.map((sheet) => ({
        sheetKey: sheet.sheetKey,
        label: sheet.label,
        mallKeys: [...sheet.mallKeys],
        categoryBy: sheet.categoryBy,
        maxProducts: sheet.maxProducts,
        fixedFields: sheet.fixedFields.map((field) => ({
          key: field.key,
          label: field.label,
          required: field.required,
          defaultValue: field.defaultValue,
          help: field.help ?? null,
        })),
        notes: [...sheet.notes],
      })),
      unavailable: MALL_BULK_SHEET_UNAVAILABLE.map((item) => ({ ...item })),
    };
  }

  async check(organizationId: string, sheetKey: string, body: unknown): Promise<SalesProductMallSheetCheck> {
    const spec = this.spec(sheetKey);
    const request = parseRequest(body);
    const scope = request.salesProductIds?.length ? 'selected' : 'missing';
    const missing = scope === 'missing' ? await this.repository.findMallSheetMissing(organizationId, spec.mallKeys) : null;
    const ids = missing?.salesProductIds ?? request.salesProductIds ?? [];
    const sources = await this.readSources(organizationId, ids);
    const context = await this.context(spec, request, sources, organizationId);
    const suggester = new MallCategorySuggester(await this.repository.listMallCategoryPaths(organizationId));
    const products = sources.map((source) => {
      const result = this.rowsFor(spec, source, context);
      return {
        salesProductId: source.id,
        code: source.code,
        name: source.name,
        rows: result.problems.length ? 0 : result.rows.length,
        problems: result.problems,
        warnings: result.warnings,
        unreadableImages: result.unreadableImages,
        categories: categoryStates(spec, source, context, suggester),
      };
    });
    return {
      sheetKey: spec.sheetKey,
      scope,
      missingFixed: missingFixedFields(spec, context.fixed),
      maybeListed: missing?.maybeListed ?? 0,
      products,
      ready: products.filter((product) => product.problems.length === 0).length,
      blocked: products.filter((product) => product.problems.length > 0).length,
    };
  }

  async file(organizationId: string, sheetKey: string, body: unknown): Promise<MallSheetFile> {
    const spec = this.spec(sheetKey);
    const request = parseRequest(body);
    const ids = request.salesProductIds ?? [];
    if (ids.length === 0) throw new BadRequestException('엑셀에 넣을 판매상품을 골라 주세요.');
    if (ids.length > spec.maxProducts) {
      throw new BadRequestException(`${spec.label}은(는) 한 파일에 ${spec.maxProducts}개까지 받습니다. 나눠서 받으세요.`);
    }
    const preflight = await this.readSources(organizationId, ids);
    // 등록 동결 · 품절 송신과 같은 게이트다. 판매가를 정하지 않은 초안은 몰 파일에 들어가지 않는다.
    for (const source of preflight) this.assertConfirmedPrice(source);
    // 파일을 만드는 순간이 판매 결정이다 — 등록 설정 없이 나가는 상품도 여기서 KID 를 받는다.
    // 한 파일이 상품 수만큼 트랜잭션을 열지 않게 한 번에 발급한다.
    await this.repository.ensureCodesForMany(organizationId, preflight.map((source) => source.id));
    const sources = await this.readSources(organizationId, ids);
    const context = await this.context(spec, request, sources, organizationId);
    const missingFixed = missingFixedFields(spec, context.fixed);
    if (missingFixed.length) throw new BadRequestException(`비어 있는 고정값: ${missingFixed.join(', ')}`);

    if (sources.length !== new Set(ids).size) throw new NotFoundException('없는 판매상품이 섞여 있습니다.');
    const rows: MallSheetRow[] = [];
    const blocked: string[] = [];
    for (const source of sources) {
      const result = this.rowsFor(spec, source, context);
      if (result.problems.length) blocked.push(`${source.code} ${result.problems[0]}`);
      else rows.push(...result.rows);
    }
    if (blocked.length) {
      throw new BadRequestException(`엑셀에 넣을 수 없는 상품이 있습니다: ${blocked.slice(0, 5).join(' / ')}`);
    }
    const buffer = await this.files.write(spec.template, rows);
    const fileName = `${spec.label.replace(/\s+/g, '')}_대량등록_${kstDate()}_${sources.length}개.${spec.template.bookType}`;
    this.logger.log(`몰 엑셀 org=${organizationId} ${spec.sheetKey} 상품 ${sources.length} · 행 ${rows.length}`);
    return { buffer, fileName, contentType: CONTENT_TYPE[spec.template.bookType], products: sources.length, rows: rows.length };
  }

  /** 여러 판매상품의 한 몰 분류를 사람이 확인해 정한다. 몰은 건드리지 않는다. */
  async assignCategory(organizationId: string, body: unknown): Promise<SalesProductMallCategoryAssignResult> {
    const parsed = SalesProductMallCategoryAssignRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', '));
    }
    const { mallKey, path, salesProductIds } = parsed.data;
    const account = (await this.repository.listChannelAccounts(organizationId)).find((item) => item.channel === mallKey);
    if (!account) throw new BadRequestException(`'${mallKey}' 몰 계정이 없습니다.`);
    const ids = [...new Set(salesProductIds)];
    const written = await this.repository.setMallCategoryPaths(
      organizationId,
      ids.map((salesProductId) => ({ salesProductId, channelAccountId: account.id, path })),
    );
    const categories = new MallCategoryLookup(await this.files.categoryTables());
    this.logger.log(`몰 분류 정함 org=${organizationId} ${mallKey} '${path}' 상품 ${salesProductIds.length} · 바뀜 ${written}`);
    return { written, code: categories.code(mallKey, path) };
  }

  private spec(sheetKey: string): MallBulkSheetSpec {
    const spec = findMallBulkSheet(sheetKey);
    if (!spec) throw new NotFoundException(`몰 엑셀 '${sheetKey}' 이 없습니다.`);
    return spec;
  }

  private async context(
    spec: MallBulkSheetSpec,
    request: SalesProductMallSheetRequest,
    sources: readonly MallSheetSourceProduct[],
    organizationId: string,
  ): Promise<SheetContext> {
    return {
      fixed: resolveFixedValues(spec, request.fixed),
      categories: new MallCategoryLookup(await this.files.categoryTables()),
      publicCopies: await this.repository.readPublicImages(organizationId, sources.flatMap(privateImageUrls)),
    };
  }

  /** 등록 동결 · 품절 송신과 같은 단일 가격 게이트. */
  private assertConfirmedPrice(source: MallSheetSourceProduct): void {
    try {
      requireConfirmedPrice({
        name: source.name,
        status: source.status,
        options: source.options.map((option) => ({
          id: option.id ?? '',
          supplyStatus: option.supplyStatus as 'selling' | 'sold_out' | 'unused',
          salePrice: option.salePrice ?? null,
        })),
      });
    } catch (error) {
      if (error instanceof SalesProductDraftError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private rowsFor(
    spec: MallBulkSheetSpec,
    source: MallSheetSourceProduct,
    context: SheetContext,
  ): MallSheetRowsResult & { unreadableImages: number } {
    const product = toMallSheetProduct(source, spec, context.categories, context.publicCopies);
    if (product.options.length === 0) {
      return { rows: [], problems: ['파는 단품이 없습니다(모든 단품이 품절 · 미사용).'], warnings: [], unreadableImages: 0 };
    }
    const result = spec.rows(product, context);
    // 몰이 못 읽는(우리 저장소) 사진이 남아 있으면 몰에서 깨진다. 사진 올리기로 공개 복사본을 먼저 만든다.
    const unreadable = unreadableSheetImages(source, product);
    if (unreadable.length === 0) return { ...result, unreadableImages: 0 };
    return {
      rows: [],
      problems: [...result.problems, `몰이 못 읽는 사진 ${unreadable.length}장이 있습니다 — [사진 올리기]로 공개 주소를 먼저 만드세요.`],
      warnings: result.warnings,
      unreadableImages: unreadable.length,
    };
  }

  /** 몰이 가진 분류 목록에서 찾기 — 몰 엑셀 창의 분류 칸이 고를거리로 보여 준다. */
  async searchCategories(sheetKey: string, query: string, mallKey?: string): Promise<SalesProductMallSheetCategoryList> {
    const spec = this.spec(sheetKey);
    const target = mallKey && spec.mallKeys.includes(mallKey) ? mallKey : spec.mallKeys[0]!;
    const categories = new MallCategoryLookup(await this.files.categoryTables());
    const found = categories.search(target, query, 50);
    return { sheetKey: spec.sheetKey, mallKey: target, paths: found.paths, total: found.total };
  }

  /** 이 판매상품들의 사진 중 몰이 못 읽고 공개 복사본도 없는 주소 — 확장이 올린다. */
  async pendingPublicImages(organizationId: string, body: unknown): Promise<SalesProductPublicImagePending> {
    const parsed = SalesProductPublicImagePendingRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('판매상품을 골라 주세요.');
    const sources = await this.readSources(organizationId, parsed.data.salesProductIds);
    const copies = await this.repository.readPublicImages(organizationId, sources.flatMap(privateImageUrls));
    const perProduct = sources.map((source) => pendingPublicImages(source, copies));
    return {
      urls: [...new Set(perProduct.flat())],
      products: perProduct.filter((list) => list.length > 0).length,
    };
  }

  /** 확장이 공개 저장소에 올린 사진 주소를 저장한다. 판매상품의 사진 주소는 그대로 둔다. */
  async savePublicImages(organizationId: string, body: unknown): Promise<{ saved: number }> {
    const parsed = SalesProductPublicImageSaveRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('올린 사진 주소가 올바르지 않습니다.');
    const images = parsed.data.images.filter((image) => isPublicImageUrl(image.publicUrl));
    if (images.length !== parsed.data.images.length) throw new BadRequestException('공개 주소가 아닌 사진이 섞여 있습니다.');
    const saved = await this.repository.savePublicImages(organizationId, images);
    this.logger.log(`공개 사진 복사본 org=${organizationId} ${saved}장`);
    return { saved };
  }
}

/** 몰마다 이 상품의 분류가 어디서 왔고 엑셀에 넣을 수 있는지, 못 넣으면 다른 몰 분류로 짐작한 추천. */
function categoryStates(
  spec: MallBulkSheetSpec,
  source: MallSheetSourceProduct,
  context: SheetContext,
  suggester: MallCategorySuggester,
): SalesProductMallSheetCategory[] {
  const categories = context.categories;
  const product = toMallSheetProduct(source, spec, categories, context.publicCopies);
  return spec.mallKeys.map((mallKey) => {
    const mall = product.malls[mallKey]!;
    const values = mall.values;
    const origin = values.categoryCode?.trim() || values.categoryPath?.trim()
      ? 'set'
      // 이 몰 값이 없어도 경로가 있으면 사방넷에서 온 것이다(분류 체계가 같은 몰에서 빌려 온 경우 포함).
      : values[SALES_PRODUCT_SABANGNET_VALUE_KEYS.categoryPath]?.trim() || mall.categoryPath ? 'sabangnet' : 'none';
    const resolved = spec.categoryBy === 'code' ? Boolean(mall.categoryCode) : Boolean(mall.categoryPath);
    const guess = resolved ? null : suggester.suggest(source.id, mallKey, source.name);
    return {
      mallKey,
      path: mall.categoryPath,
      code: mall.categoryCode,
      source: origin,
      resolved,
      suggestion: guess && guess.path !== mall.categoryPath
        ? {
          ...guess,
          resolves: spec.categoryBy === 'name' || categories.code(mallKey, guess.path) !== null,
        }
        : null,
    };
  });
}

function parseRequest(body: unknown): SalesProductMallSheetRequest {
  const parsed = SalesProductMallSheetRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', '));
  }
  return parsed.data;
}

/** 파일 이름에 쓰는 한국 날짜(YYYYMMDD). */
function kstDate(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
}

function byId(sources: readonly MallSheetSourceProduct[]): Map<string, MallSheetSourceProduct> {
  return new Map(sources.map((source) => [source.id, source]));
}


