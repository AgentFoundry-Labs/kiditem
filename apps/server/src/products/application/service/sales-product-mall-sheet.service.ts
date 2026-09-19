import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  SALES_PRODUCT_SABANGNET_VALUE_KEYS,
  SalesProductMallCategoryAssignRequestSchema,
  SalesProductMallSheetRequestSchema,
  type SalesProductMallCategoryAssignResult,
  type SalesProductMallSheetCategory,
  type SalesProductMallSheetCheck,
  type SalesProductMallSheetList,
  type SalesProductMallSheetRequest,
} from '@kiditem/shared/sales-product';
import {
  missingFixedFields,
  resolveFixedValues,
  type MallBulkSheetSpec,
  type MallSheetContext,
  type MallSheetRow,
  type MallSheetRowsResult,
} from '../../domain/mall-bulk-sheet/mall-bulk-sheet';
import {
  findMallBulkSheet,
  MALL_BULK_SHEET_UNAVAILABLE,
  MALL_BULK_SHEETS,
} from '../../domain/mall-bulk-sheet/mall-bulk-sheet-registry';
import { MallCategoryLookup } from '../../domain/mall-bulk-sheet/mall-sheet-categories';
import { MallCategorySuggester } from '../../domain/mall-bulk-sheet/mall-category-suggestions';
import { toMallSheetProduct, type MallSheetSourceProduct } from '../../domain/mall-bulk-sheet/mall-sheet-product';
import {
  SALES_PRODUCT_REPOSITORY_PORT,
  type SalesProductRepositoryPort,
} from '../port/out/repository/sales-product.repository.port';
import {
  MALL_BULK_SHEET_FILES_PORT,
  type MallBulkSheetFilesPort,
} from '../port/out/storage/mall-bulk-sheet-files.port';

const CONTENT_TYPE: Record<MallBulkSheetSpec['template']['bookType'], string> = {
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
};

export interface MallSheetFile {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  products: number;
  rows: number;
}

/**
 * 판매상품 → 몰 대량등록 엑셀(ADR-0014). 몰 양식은 몰마다 다르고, 몰 규칙(`MALL_BULK_SHEETS`)이 판매상품 한 건을 그
 * 몰 행으로 바꾼다. 먼저 `check` 로 무엇이 들어가고 무엇이 막히는지 보이고, 사람이 고른 상품으로 `file` 을 만든다.
 * 파일을 만드는 것은 등록이 아니다 — 사람이 몰 판매자센터에 올리고, 몰 상품을 다시 가져와야 등록을 안다.
 */
@Injectable()
export class SalesProductMallSheetService {
  private readonly logger = new Logger(SalesProductMallSheetService.name);

  constructor(
    @Inject(SALES_PRODUCT_REPOSITORY_PORT)
    private readonly repository: SalesProductRepositoryPort,
    @Inject(MALL_BULK_SHEET_FILES_PORT)
    private readonly files: MallBulkSheetFilesPort,
  ) {}

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
    const sources = await this.repository.readMallSheetProducts(organizationId, ids);
    const context = await this.context(spec, request);
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
        categories: categoryStates(spec, source, context.categories, suggester),
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
    const context = await this.context(spec, request);
    const missingFixed = missingFixedFields(spec, context.fixed);
    if (missingFixed.length) throw new BadRequestException(`비어 있는 고정값: ${missingFixed.join(', ')}`);

    const sources = await this.repository.readMallSheetProducts(organizationId, ids);
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
    const written = await this.repository.setMallCategoryPaths(
      organizationId,
      [...new Set(salesProductIds)].map((salesProductId) => ({ salesProductId, channelAccountId: account.id, path })),
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

  private async context(spec: MallBulkSheetSpec, request: SalesProductMallSheetRequest): Promise<MallSheetContext> {
    return {
      fixed: resolveFixedValues(spec, request.fixed),
      categories: new MallCategoryLookup(await this.files.categoryTables()),
    };
  }

  private rowsFor(spec: MallBulkSheetSpec, source: MallSheetSourceProduct, context: MallSheetContext): MallSheetRowsResult {
    const product = toMallSheetProduct(source, spec, context.categories);
    if (product.options.length === 0) {
      return { rows: [], problems: ['파는 단품이 없습니다(모든 단품이 품절 · 미사용).'], warnings: [] };
    }
    return spec.rows(product, context);
  }
}

/** 몰마다 이 상품의 분류가 어디서 왔고 엑셀에 넣을 수 있는지, 못 넣으면 다른 몰 분류로 짐작한 추천. */
function categoryStates(
  spec: MallBulkSheetSpec,
  source: MallSheetSourceProduct,
  categories: MallCategoryLookup,
  suggester: MallCategorySuggester,
): SalesProductMallSheetCategory[] {
  const product = toMallSheetProduct(source, spec, categories);
  return spec.mallKeys.map((mallKey) => {
    const mall = product.malls[mallKey]!;
    const values = mall.values;
    const origin = values.categoryCode?.trim() || values.categoryPath?.trim()
      ? 'set'
      : values[SALES_PRODUCT_SABANGNET_VALUE_KEYS.categoryPath]?.trim() ? 'sabangnet' : 'none';
    const resolved = spec.categoryBy === 'code' ? Boolean(mall.categoryCode) : Boolean(mall.categoryPath);
    const guess = resolved ? null : suggester.suggest(source.id, mallKey);
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
