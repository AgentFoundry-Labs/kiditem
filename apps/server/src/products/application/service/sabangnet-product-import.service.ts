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
import {
  SALES_PRODUCT_IMAGE_MIRROR_PORT,
  type SalesProductImageMirrorPort,
} from '../port/out/storage/sales-product-image-mirror.port';
import { mirroredImageKey, preferMirroredImageUrls } from '../../domain/sales-product-images';
import {
  buildSabangnetImportPlan,
  planSabangnetMallValues,
  sabangnetShopMallKey,
} from './sabangnet-product-import.plan';
import { SalesProductLinkService } from './sales-product-link.service';
import type { SendRecordLink } from '../../domain/sales-product-links';
import {
  parseSabangnetWorkbook,
  SabangnetWorkbookFormatError,
  type ParsedSabangnetWorkbook,
  type SabangnetChannelOverrideRow,
  type SabangnetMallCategoryRow,
  type SabangnetMallTemplateRow,
  type SabangnetOptionRow,
  type SabangnetProductRow,
  type SabangnetSendRecordRow,
} from './sabangnet-product-workbook.parser';

export interface UploadedWorkbook {
  originalname: string;
  buffer: Buffer;
}

const MAX_FILES = 6;

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
    private readonly links: SalesProductLinkService,
    @Inject(SALES_PRODUCT_IMAGE_MIRROR_PORT)
    private readonly images: SalesProductImageMirrorPort,
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
    const sendRecordRows = (byKind.get('send_records')?.rows ?? []) as SabangnetSendRecordRow[];
    const sendRecords = toSendRecordLinks(sendRecordRows);
    if (!products && !byKind.has('send_records')) {
      throw new BadRequestException('사방넷상품대량수정(또는 대량등록) 파일이나 쇼핑몰상품수정 다운로드 파일이 있어야 합니다.');
    }
    if ((byKind.has('mall_categories') || byKind.has('mall_templates')) && !byKind.has('send_records')) {
      throw new BadRequestException('쇼핑몰카테고리 · 쇼핑몰부가정보는 어느 상품이 썼는지 알려 주는 쇼핑몰상품수정 다운로드와 함께 올리세요.');
    }
    const mallValues = (productIdByCode: ReadonlyMap<string, string>, accounts: readonly { id: string; channel: string }[]) =>
      planSabangnetMallValues({
        sendRecords: sendRecordRows,
        categories: (byKind.get('mall_categories')?.rows ?? []) as SabangnetMallCategoryRow[],
        templates: (byKind.get('mall_templates')?.rows ?? []) as SabangnetMallTemplateRow[],
        productIdByCode,
        accounts,
      });
    const writeMallValues = async () => {
      if (sendRecordRows.length === 0) return null;
      const [productIdByCode, accounts] = await Promise.all([
        this.repository.readProductIdsByCodes(organizationId, [...new Set(sendRecordRows.map((row) => row.goodsNo))]),
        this.repository.listChannelAccounts(organizationId),
      ]);
      const planned = mallValues(productIdByCode, accounts);
      if (!dryRun) await this.repository.mergeSabangnetMallValues(organizationId, planned.writes);
      return { pairs: planned.writes.length, withCategory: planned.withCategory, withTemplate: planned.withTemplate };
    };
    if (!products) {
      // 송신 기록만 올렸다 — 상품은 그대로 두고 몰 상품을 잇고, 상품 × 몰의 사방넷 분류 · 부가정보를 옮긴다.
      const links = dryRun
        ? await this.links.preview(organizationId, sendRecords)
        : await this.links.autoLink(organizationId, sendRecords);
      return { ...emptyPreview(dryRun, parsed), links, mallValues: await writeMallValues() };
    }

    const productRows = products.rows as SabangnetProductRow[];
    const ownCodesWithoutGoodsNo = productRows.flatMap((row) => (!row.goodsNo && row.ownCode ? [row.ownCode] : []));
    const [skus, accounts, existingCodeByOwnCode] = await Promise.all([
      this.sellpiaSkus.listActiveForMatching(organizationId),
      this.repository.listChannelAccounts(organizationId),
      this.repository.findCodesByOwnCodes(organizationId, ownCodesWithoutGoodsNo),
    ]);
    const plan = buildSabangnetImportPlan({
      products: productRows,
      options: (byKind.get('options')?.rows ?? []) as SabangnetOptionRow[],
      overrides: (byKind.get('channel_overrides')?.rows ?? []) as SabangnetChannelOverrideRow[],
      skus,
      accounts,
      existingCodeByOwnCode,
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
    const mirroredUrl = (url: string) => {
      const key = mirroredImageKey(organizationId, url);
      return key ? this.images.urlFor(key) : null;
    };
    for (const planned of plan.products) {
      const current = fingerprints.get(planned.create.code);
      // 이미 우리 저장소로 옮긴 사진은 다시 가져와도 옮긴 주소를 지킨다.
      const product = {
        ...planned,
        create: {
          ...planned.create,
          imageUrls: preferMirroredImageUrls({
            incoming: planned.create.imageUrls,
            current: current?.imageUrls ?? [],
            mirroredUrl,
          }),
        },
      };
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
      const same = state !== undefined && current?.fingerprint === fingerprint
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
      links: null,
      mallValues: null,
    };
    if (dryRun) {
      return {
        ...preview,
        links: sendRecords.length > 0 ? await this.links.preview(organizationId, sendRecords) : null,
        // 새로 만들 판매상품은 아직 id 가 없어 세지 못한다 — 옮긴 뒤 다시 미리보면 잡힌다.
        mallValues: await writeMallValues(),
      };
    }

    const result = await this.repository.importSabangnet(organizationId, writes);
    // 옮긴 판매상품을 몰에 올라간 상품과 잇는다(사방넷 기록 · 판매자 상품코드 · 올린 송신 기록).
    const links = await this.links.autoLink(organizationId, sendRecords);
    const savedMallValues = await writeMallValues();
    this.logger.log(
      `사방넷 가져오기 org=${organizationId} 새로 ${result.created} · 고침 ${result.updated} · 그대로 ${result.unchanged} · 몰별 값 ${result.overridesSaved}`,
    );
    return {
      ...preview,
      products: { ...preview.products, created: result.created, updated: result.updated, unchanged: result.unchanged },
      channelOverrides: { ...preview.channelOverrides, saved: result.overridesSaved },
      links,
      mallValues: savedMallValues,
    };
  }
}

function toSendRecordLinks(rows: readonly SabangnetSendRecordRow[]): SendRecordLink[] {
  return rows.flatMap((row) => {
    const mallKey = sabangnetShopMallKey(row.shopCode);
    return mallKey ? [{ mallKey, mallProductCode: row.mallProductCode, goodsNo: row.goodsNo }] : [];
  });
}

function emptyPreview(dryRun: boolean, parsed: readonly ParsedSabangnetWorkbook[]): SabangnetImportPreview {
  return {
    dryRun,
    files: parsed.map((workbook) => ({ name: workbook.name, kind: workbook.kind, rows: workbook.rows.length })),
    products: { total: 0, created: 0, updated: 0, unchanged: 0 },
    options: { total: 0, withOptionsProducts: 0, linked: 0, unlinked: 0 },
    channelOverrides: { total: 0, saved: 0, skippedByShop: {} },
    issues: parsed.flatMap((workbook) => workbook.issues).slice(0, 200),
    issueCount: parsed.reduce((sum, workbook) => sum + workbook.issues.length, 0),
    links: null,
    mallValues: null,
  };
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
