import type { SabangnetProductImportPort, UploadedWorkbook } from "../../port/in/collection/sabangnet-product-import.port";
export type { UploadedWorkbook } from "../../port/in/collection/sabangnet-product-import.port";
import type { ChannelIntegrityPort } from '../../port/out/integrity/channel-integrity.port';
import type { ChannelActivityPort } from '../../port/out/alerts/channel-activity.port';
import { CHANNEL_DOCUMENTS_PORT, type ChannelDocumentsPort } from '../../port/out/documents/channel-documents.port';
import { issueSalesProductOptionCodes } from '../sales-product/sales-product-code';
import { ChannelInputError as BadRequestException, ChannelConflictError as ConflictException } from '../../../domain/exception/channel-business-error';
import type {
  SabangnetImportPreview,
  SabangnetImportSelection,
  SabangnetWorkbookKind,
} from '@kiditem/shared/sales-product';
import {
  PRODUCT_SOURCE_READ_PORT,
  type ProductSourceReadPort,
} from '../../../../products/application/port/in/product-source-read.port';
import {
  pickFingerprintBasics,
  planSalesProductOptionReplacement,
  salesProductImportFingerprint,
  SalesProductOptionPlanError,
} from '../../../domain/sales-product/sales-product';
import {
  SALES_PRODUCT_REPOSITORY_PORT,
  type SabangnetImportProductWrite,
  type SalesProductRepositoryPort,
} from '../../port/out/persistence/sales-product.repository.port';
import {
  SALES_PRODUCT_IMAGE_MIRROR_PORT,
  type SalesProductImageMirrorPort,
} from '../../port/out/storage/sales-product-image-mirror.port';
import { mirroredImageKey, preferMirroredImageUrls } from '../../../domain/sales-product/sales-product-images';
import { isDraft } from '../../../domain/sales-product/sales-product-status';
import {
  buildSabangnetImportPlan,
  planSabangnetMallValues,
  sabangnetProductBasics,
  sabangnetShopMallKey,
} from './sabangnet-product-import.plan';
import {
  mergeSabangnetReimport,
  sabangnetDetailDigests,
  sameImportValue,
  type SabangnetReimportBaseline,
} from '../../../domain/sales-product/sales-product-reimport-merge';
import type { SalesProductLinkPort } from '../../port/in/sales-product/sales-product-link.port';
import type { SendRecordLink } from '../../../domain/sales-product/sales-product-links';
import {
  type ParsedSabangnetWorkbook,
  type SabangnetChannelOverrideRow,
  type SabangnetMallCategoryRow,
  type SabangnetMallTemplateRow,
  type SabangnetOptionRow,
  type SabangnetProductRow,
  type SabangnetSendRecordRow,
} from '../../port/out/documents/channel-document.models';

const MAX_FILES = 6;

/**
 * 사방넷 엑셀 가져오기(KID-264). 같은 파일을 두 번 올려도 결과가 같다 — 판매상품코드(사방넷 품번)로 찾아
 * 덮어쓰고, 바뀐 게 없는 상품은 건드리지 않는다. `dryRun` 이면 쓰지 않고 무엇이 바뀔지만 센다.
 */

export class SabangnetProductImportService implements SabangnetProductImportPort {


  constructor(

    private readonly repository: SalesProductRepositoryPort,

    private readonly sourceProducts: ProductSourceReadPort,
    private readonly links: SalesProductLinkPort,

    private readonly images: SalesProductImageMirrorPort,
     private readonly documents: ChannelDocumentsPort,
    private readonly logger: ChannelActivityPort,
    private readonly integrity: ChannelIntegrityPort,
  ) {}

  async import(
    organizationId: string,
    files: readonly UploadedWorkbook[],
    dryRun: boolean,
    selections: SabangnetImportSelection = [],
  ): Promise<SabangnetImportPreview> {
    const selectionByProductId = new Map<string, SabangnetImportSelection[number]>();
    for (const selection of selections) {
      if (selectionByProductId.has(selection.salesProductId)) {
        throw new BadRequestException(`같은 판매상품을 두 번 고를 수 없습니다: ${selection.salesProductId}`);
      }
      selectionByProductId.set(selection.salesProductId, selection);
    }
    if (files.length === 0) throw new BadRequestException('사방넷 엑셀 파일을 올리세요.');
    if (files.length > MAX_FILES) throw new BadRequestException(`파일은 ${MAX_FILES}개까지 올립니다.`);
    const parsed = files.map((file) => this.documents.parseSabangnetWorkbook(file.buffer, file.originalname));
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
      if (selectionByProductId.size > 0) {
        throw new BadRequestException('고른 기존 상품이 상품 파일에 없습니다.');
      }
      // 송신 기록만 올렸다 — 상품은 그대로 두고 몰 상품을 잇고, 상품 × 몰의 사방넷 분류 · 부가정보를 옮긴다.
      const links = dryRun
        ? await this.links.preview(organizationId, sendRecords)
        : await this.links.autoLink(organizationId, sendRecords);
      return { ...emptyPreview(dryRun, parsed), links, mallValues: await writeMallValues() };
    }

    const productRows = products.rows as SabangnetProductRow[];
    const [skus, accounts] = await Promise.all([
      this.sourceProducts.listActiveForMatching(organizationId),
      this.repository.listChannelAccounts(organizationId),
    ]);
    const plan = buildSabangnetImportPlan({
      products: productRows,
      options: (byKind.get('options')?.rows ?? []) as SabangnetOptionRow[],
      overrides: (byKind.get('channel_overrides')?.rows ?? []) as SabangnetChannelOverrideRow[],
      skus,
      accounts,
    });
    const codes = [...new Set(plan.products.flatMap((product) => [
      product.create.sabangnetGoodsNo,
      product.create.ownCode,
      product.create.code,
    ].filter((code): code is string => !!code)))];
    const [states, fingerprints] = await Promise.all([
      this.repository.readImportOptionStates(organizationId, codes),
      this.repository.readImportFingerprints(organizationId, codes),
    ]);
    const statesByProductId = new Map([...states.values()].map((state) => [state.productId, state] as const));
    for (const selection of selectionByProductId.values()) {
      const state = statesByProductId.get(selection.salesProductId);
      if (!state) {
        throw new BadRequestException(`고른 기존 상품을 이번 파일에서 찾을 수 없습니다: ${selection.salesProductId}`);
      }
      if (state.version !== selection.expectedVersion) {
        throw new ConflictException(`미리보기 뒤 판매상품이 바뀌었습니다: ${selection.salesProductId}`);
      }
    }

    const issues = [...parsed.flatMap((workbook) => workbook.issues), ...plan.issues];
    const writes: SabangnetImportProductWrite[] = [];
    const existingChangesByProductId = new Map<string, SabangnetImportPreview['existingChanges'][number]>();
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const mirroredUrl = (url: string) => {
      const key = mirroredImageKey(organizationId, url, (value) => this.integrity.sha256(value));
      return key ? this.images.urlFor(key) : null;
    };
    for (const planned of plan.products) {
      const sourceKeys = [planned.create.sabangnetGoodsNo, planned.create.ownCode, planned.create.code]
        .filter((code): code is string => !!code);
      const current = sourceKeys.map((key) => fingerprints.get(key)).find(Boolean);
      // 이미 우리 저장소로 옮긴 사진은 다시 가져와도 옮긴 주소를 지킨다.
      const preferMirrored = (urls: readonly string[]) => preferMirroredImageUrls({
        incoming: urls,
        current: current?.imageUrls ?? [],
        mirroredUrl,
      });
      const incoming = { ...planned.create, imageUrls: preferMirrored(planned.create.imageUrls) };
      // 있는 상품이면 지난 가져오기 뒤 사람이 고친 칸을 지킨다(삼자 병합). 원문은 이번 파일 줄로 바꾼다.
      const merge = current
        ? mergeSabangnetReimport({
          current: current.basics,
          incoming,
          baseline: this.reimportBaseline(current.sourceRaw, preferMirrored),
        })
        : null;
      const product = { ...planned, create: merge?.merged ?? incoming };
      const state = sourceKeys.map((key) => states.get(key)).find(Boolean);
      // 자체코드가 같은 초안은 사방넷 상품이 아니다 — 초안은 KID 가 없어 이 줄로 덮으면 판매 상품이
      // 코드 없이 생긴다. 줄을 넘기고 어느 초안과 겹쳤는지 말한다(KID-313).
      if (state && isDraft(state.status)) {
        issues.push({
          kind: 'products',
          row: 0,
          code: sourceKeys.find((key) => states.get(key)?.productId === state.productId) ?? '',
          message: `초안 '${state.productName}' 과 자체상품코드가 같아 이 줄을 넘겼습니다. 초안의 자체코드를 고치거나 초안을 지운 뒤 다시 가져오세요.`,
        });
        continue;
      }
      // 사방넷에서 옮긴 상품은 품번코드를 이미 들고 온다. 없으면 어느 줄이 문제인지 말한다.
      const importedCode = product.create.code;
      if (!importedCode) {
        issues.push({ kind: 'products', row: 0, code: '', message: '사방넷 상품에 품번코드가 없습니다.' });
        continue;
      }
      let optionPlan;
      try {
        optionPlan = planSalesProductOptionReplacement({
          productCode: importedCode,
          existing: state?.options ?? [],
          options: product.options,
        });
      } catch (error) {
        if (!(error instanceof SalesProductOptionPlanError)) throw error;
        issues.push({ kind: 'products', row: 0, code: importedCode, message: error.message });
        continue;
      }
      const fingerprint = salesProductImportFingerprint({
        basics: pickFingerprintBasics(product.create as unknown as Record<string, unknown>),
        optionAxes: product.create.optionAxes,
        options: optionPlan.writes,
      });
      // 지문에 없는 칸(KC 상태)도 병합이 바꾸면 바뀐 것이다. 원문이 달라도 바뀐 것이다 — 고른 상품은
      // 이번 파일 줄을 다음 가져오기의 기준값으로 남긴다.
      const sameContent = state !== undefined && current?.fingerprint === fingerprint
        && (merge?.updated.length ?? 0) === 0
        && optionPlan.retireIds.length === 0 && optionPlan.deleteIds.length === 0;
      const sameBaseline = sameImportValue(current?.sourceRaw, product.create.sourceRaw);
      const same = sameContent && sameBaseline;
      if (state) {
        existingChangesByProductId.set(state.productId, {
          salesProductId: state.productId,
          code: state.productCode ?? importedCode,
          name: product.create.name,
          sourceKey: sourceKeys.find((key) => states.get(key)?.productId === state.productId) ?? importedCode,
          expectedVersion: state.version,
          changed: !same,
          baselineOnly: sameContent && !sameBaseline,
          preserved: merge?.preserved ?? [],
          updated: merge?.updated ?? [],
        });
      }
      const selection = state ? selectionByProductId.get(state.productId) : undefined;
      if (!state) created += 1;
      else if (same || !selection) unchanged += 1;
      else updated += 1;
      const preserve = !!state && (same || !selection);
      const create = { ...product.create, code: state?.productCode ?? product.create.code };
      if (!dryRun && !preserve) {
        if (!state) create.code = await this.repository.allocateCode(organizationId);
        await issueSalesProductOptionCodes(organizationId, optionPlan, this.repository);
      }
      writes.push({
        mode: preserve ? 'preserve' : 'upsert',
        ...(state ? {
          existingProductId: state.productId,
          expectedVersion: selection?.expectedVersion ?? state.version,
        } : {}),
        create,
        plan: optionPlan,
        overrides: product.overrides.map(({ channelAccountId, data }) => ({ channelAccountId, data })),
        detail: this.importedDetail(product.detail),
      });
    }

    const allOptions = plan.products.flatMap((product) => product.options);
    const preview: SabangnetImportPreview = {
      dryRun,
      existingChanges: [...existingChangesByProductId.values()],
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

  /**
   * 지난 가져오기가 만든 값: 저장된 원문을 같은 매핑으로 다시 읽는다. 사진은 지금 값과 같은 규칙으로 옮긴 주소를
   * 적용해, 옮긴 것을 사람이 고친 것으로 보지 않는다. 원문이 없거나 읽을 수 없으면 기준값이 없다.
   */
  private reimportBaseline(
    sourceRaw: unknown,
    preferMirrored: (urls: readonly string[]) => string[],
  ): SabangnetReimportBaseline | null {
    const row = this.documents.readSabangnetProductSource(sourceRaw);
    if (!row) return null;
    const basics = sabangnetProductBasics(row);
    return { basics: { ...basics, imageUrls: preferMirrored(basics.imageUrls) } };
  }

  /**
   * 상세는 Content 의 `imported` revision 으로 간다(KID-313 W2). digest 는 원문에 남기는 KID-304 디지스트
   * `#digest:상품상세설명` 과 같은 값이다 — 같은 상세를 다시 가져오면 revision 이 생기지 않는다.
   */
  private importedDetail(
    detail: { html: string } | null,
  ): SabangnetImportProductWrite['detail'] {
    if (!detail) return null;
    const digests = sabangnetDetailDigests(
      { detailHtml: detail.html, extraDetailHtml: [] },
      (value) => this.integrity.sha256(value),
    );
    return { html: detail.html, digest: digests.detailHtml };
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
    existingChanges: [],
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
