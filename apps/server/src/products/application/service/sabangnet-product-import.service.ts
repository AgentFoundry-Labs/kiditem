import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { SabangnetImportPreview, SabangnetWorkbookKind } from '@kiditem/shared/sales-product';
import {
  SELLPIA_INVENTORY_SKU_READ_PORT,
  type SellpiaInventorySkuReadPort,
} from '../../../inventory/application/port/in/stock/sellpia-inventory-sku-read.port';
import {
  pickFingerprintBasics,
  planSalesProductOptionReplacement,
  salesProductImportFingerprint,
  SalesProductOptionPlanError,
} from '../../domain/sales-product';
import {
  SALES_PRODUCT_REPOSITORY_PORT,
  type SabangnetImportProductWrite,
  type SalesProductRepositoryPort,
} from '../port/out/repository/sales-product.repository.port';
import { buildSabangnetImportPlan } from './sabangnet-product-import.plan';
import {
  parseSabangnetWorkbook,
  SabangnetWorkbookFormatError,
  type ParsedSabangnetWorkbook,
  type SabangnetChannelOverrideRow,
  type SabangnetOptionRow,
  type SabangnetProductRow,
} from './sabangnet-product-workbook.parser';

export interface UploadedWorkbook {
  originalname: string;
  buffer: Buffer;
}

const MAX_FILES = 3;

/**
 * 사방넷 엑셀 가져오기(KID-264). 같은 파일을 두 번 올려도 결과가 같다 — 판매상품코드(사방넷 품번)로 찾아
 * 덮어쓰고, 바뀐 게 없는 상품은 건드리지 않는다. `dryRun` 이면 쓰지 않고 무엇이 바뀔지만 센다.
 */
@Injectable()
export class SabangnetProductImportService {
  private readonly logger = new Logger(SabangnetProductImportService.name);

  constructor(
    @Inject(SALES_PRODUCT_REPOSITORY_PORT)
    private readonly repository: SalesProductRepositoryPort,
    @Inject(SELLPIA_INVENTORY_SKU_READ_PORT)
    private readonly sellpiaSkus: SellpiaInventorySkuReadPort,
  ) {}

  async import(
    organizationId: string,
    files: readonly UploadedWorkbook[],
    dryRun: boolean,
  ): Promise<SabangnetImportPreview> {
    if (files.length === 0) throw new BadRequestException('사방넷 엑셀 파일을 올리세요.');
    if (files.length > MAX_FILES) throw new BadRequestException(`파일은 ${MAX_FILES}개까지 올립니다.`);
    const parsed = files.map((file) => parseOrBadRequest(file));
    const byKind = new Map<SabangnetWorkbookKind, ParsedSabangnetWorkbook>();
    for (const workbook of parsed) {
      if (byKind.has(workbook.kind)) throw new BadRequestException('같은 종류의 파일을 두 번 올렸습니다.');
      byKind.set(workbook.kind, workbook);
    }
    const products = byKind.get('products');
    if (!products) {
      throw new BadRequestException('사방넷상품대량수정(또는 대량등록) 파일이 있어야 합니다.');
    }

    const [skus, accounts] = await Promise.all([
      this.sellpiaSkus.listActiveForMatching(organizationId),
      this.repository.listChannelAccounts(organizationId),
    ]);
    const plan = buildSabangnetImportPlan({
      products: products.rows as SabangnetProductRow[],
      options: (byKind.get('options')?.rows ?? []) as SabangnetOptionRow[],
      overrides: (byKind.get('channel_overrides')?.rows ?? []) as SabangnetChannelOverrideRow[],
      skus,
      accounts,
    });
    const codes = plan.products.map((product) => product.create.code);
    const [states, fingerprints] = await Promise.all([
      this.repository.readOptionStatesByCodes(organizationId, codes),
      this.repository.readImportFingerprints(organizationId, codes),
    ]);

    const issues = [...parsed.flatMap((workbook) => workbook.issues), ...plan.issues];
    const writes: SabangnetImportProductWrite[] = [];
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    for (const product of plan.products) {
      const state = states.get(product.create.code);
      let optionPlan;
      try {
        optionPlan = planSalesProductOptionReplacement({
          productCode: product.create.code,
          existing: state?.options ?? [],
          options: product.options,
        });
      } catch (error) {
        if (!(error instanceof SalesProductOptionPlanError)) throw error;
        issues.push({ kind: 'products', row: 0, code: product.create.code, message: error.message });
        continue;
      }
      const fingerprint = salesProductImportFingerprint({
        basics: pickFingerprintBasics(product.create as unknown as Record<string, unknown>),
        optionAxes: product.create.optionAxes,
        options: optionPlan.writes,
      });
      const same = state !== undefined && fingerprints.get(product.create.code) === fingerprint
        && optionPlan.retireIds.length === 0 && optionPlan.deleteIds.length === 0;
      if (!state) created += 1;
      else if (same) unchanged += 1;
      else updated += 1;
      writes.push({
        mode: same ? 'overrides_only' : 'upsert',
        create: product.create,
        plan: optionPlan,
        overrides: product.overrides.map(({ channelAccountId, data }) => ({ channelAccountId, data })),
      });
    }

    const allOptions = plan.products.flatMap((product) => product.options);
    const preview: SabangnetImportPreview = {
      dryRun,
      files: parsed.map((workbook) => ({ name: workbook.name, kind: workbook.kind, rows: workbook.rows.length })),
      products: { total: plan.products.length, created, updated, unchanged },
      options: {
        total: allOptions.length,
        withOptionsProducts: plan.products.filter((product) => product.create.optionAxes.length > 0).length,
        linked: allOptions.filter((option) => option.components.length > 0).length,
        unlinked: allOptions.filter((option) => option.supplyStatus !== 'unused' && option.components.length === 0).length,
      },
      channelOverrides: {
        total: plan.overrideRows,
        saved: writes.reduce((sum, write) => sum + write.overrides.length, 0),
        skippedByShop: plan.skippedByShop,
      },
      issues: issues.slice(0, 200),
      issueCount: issues.length,
    };
    if (dryRun) return preview;

    const result = await this.repository.importSabangnet(organizationId, writes);
    this.logger.log(
      `사방넷 가져오기 org=${organizationId} 새로 ${result.created} · 고침 ${result.updated} · 그대로 ${result.unchanged} · 몰별 값 ${result.overridesSaved}`,
    );
    return {
      ...preview,
      products: { ...preview.products, created: result.created, updated: result.updated, unchanged: result.unchanged },
      channelOverrides: { ...preview.channelOverrides, saved: result.overridesSaved },
    };
  }
}

function parseOrBadRequest(file: UploadedWorkbook): ParsedSabangnetWorkbook {
  try {
    return parseSabangnetWorkbook(file.buffer, decodeFileName(file.originalname));
  } catch (error) {
    if (error instanceof SabangnetWorkbookFormatError) throw new BadRequestException(error.message);
    throw error;
  }
}

/** multer 는 한글 파일 이름을 latin1 로 준다. */
function decodeFileName(name: string): string {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('�') ? name : decoded;
  } catch {
    return name;
  }
}
