import { createHash } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  RocketPurchasePreviewRequestSchema,
  type RocketPoCatalogRow,
  type RocketPurchasePreviewRequest,
} from '@kiditem/shared/rocket-purchase-preview';
import {
  type RocketPoCatalogPort,
  type RocketPoCatalogResolution,
  type RocketStockMatchRow,
} from '../port/in/rocket-po-catalog.port';
import {
  ROCKET_PO_CATALOG_REPOSITORY_PORT,
  type RocketPoCatalogRepositoryPort,
} from '../port/out/repository/rocket-po-catalog.repository.port';
import {
  SELLPIA_RECIPE_EVIDENCE_PORT,
  type SellpiaRecipeEvidencePort,
} from '../port/out/cross-domain/sellpia-recipe-evidence.port';
import { ChannelRecipeAutomationService } from './channel-recipe-automation.service';
import {
  buildNameMatchIndex,
  coupangNamePrice,
  matchCoupangProductByName,
  normalizeCoupangName,
} from '../../domain/coupang-name-matcher';

/** 셀피아/쿠팡 바코드 정규화 — 숫자만 남긴다(findByNormalizedBarcodes 규약과 동일). */
function normalizeBarcode(value: string | null | undefined): string {
  return String(value ?? '').replace(/[^0-9]/g, '');
}

const ARTIFACT_FILE_NAME = 'rocket-po-catalog.json' as const;

@Injectable()
export class RocketPoCatalogService implements RocketPoCatalogPort {
  constructor(
    @Inject(ROCKET_PO_CATALOG_REPOSITORY_PORT)
    private readonly repository: RocketPoCatalogRepositoryPort,
    @Inject(SELLPIA_RECIPE_EVIDENCE_PORT)
    private readonly evidence: SellpiaRecipeEvidencePort,
    private readonly recipeAutomation: ChannelRecipeAutomationService,
  ) {}

  async publishAndResolve(input: {
    organizationId: string;
    userId: string;
    request: RocketPurchasePreviewRequest;
  }): Promise<RocketPoCatalogResolution> {
    const request = RocketPurchasePreviewRequestSchema.parse(input.request);
    if (!isCompleteCollection(request)) {
      return { blockingReason: 'collection_incomplete', catalog: null, identities: [] };
    }

    const account = await this.repository.findActiveRocketAccount({
      organizationId: input.organizationId,
      channelAccountId: request.channelAccountId,
    });
    if (!account) throw new NotFoundException('Active Rocket channel account not found');
    if (request.rows.length === 0) {
      return { blockingReason: null, catalog: null, identities: [] };
    }
    const accountVendorId = account.vendorId?.trim() ?? '';
    const sharedCoupangVendorId = account.sharedCoupangVendorId?.trim() ?? '';
    const evidenceVendorId = request.collection.vendorId.trim();
    const configuredVendorIds = [accountVendorId, sharedCoupangVendorId]
      .filter((vendorId) => vendorId.length > 0);
    if (evidenceVendorId.length > 0
      && configuredVendorIds.some((vendorId) => vendorId !== evidenceVendorId)) {
      return { blockingReason: 'vendor_mismatch', catalog: null, identities: [] };
    }
    const vendorId = evidenceVendorId || configuredVendorIds[0]!;

    const rows = [...request.rows].sort((left, right) =>
      left.poLineId.localeCompare(right.poLineId));
    const artifactHash = canonicalArtifactHash(request, vendorId, rows);
    const published = await this.repository.publish({
      organizationId: input.organizationId,
      userId: input.userId,
      channelAccountId: request.channelAccountId,
      vendorId,
      fileName: ARTIFACT_FILE_NAME,
      artifactHash,
      collection: request.collection,
      rows,
    });
    const recipeAutomation = await this.recipeAutomation.applySafeForOptions({
      organizationId: input.organizationId,
      channelAccountId: request.channelAccountId,
      channelListingOptionIds: published.identities.map(({ channelSkuId }) => channelSkuId),
    });
    const { identities, ...catalog } = published;
    return {
      blockingReason: null,
      catalog: { ...catalog, recipeAutomation },
      identities,
    };
  }

  listSavedPos(input: {
    organizationId: string;
    channelAccountId: string;
    from: string;
    to: string;
    status?: string;
  }) {
    return this.repository.listSavedPos(input);
  }

  loadSavedCollection(input: {
    organizationId: string;
    channelAccountId: string;
    sourceImportRunId: string;
  }) {
    return this.repository.loadSavedCollection(input);
  }

  /**
   * 저장된 수집본의 상품을 셀피아 재고에 **바코드**로 매칭한다(read-only, recipe 무관).
   * 셀피아 주문수집이 쓰는 바코드 키와 동일. 같은 바코드가 여러 SKU(쿠팡용/일반)에
   * 걸리면 재고를 합산하고 대표 이름 하나를 쓴다.
   */
  async matchSavedStock(input: {
    organizationId: string;
    channelAccountId: string;
    sourceImportRunId: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<RocketStockMatchRow[]> {
    const collection = await this.repository.loadSavedCollection(input);
    if (!collection) return [];

    // 입고예정일 범위가 주어지면 그 범위 행만 매칭한다(전송량·매칭비용 절감).
    const from = input.fromDate?.trim() || null;
    const to = input.toDate?.trim() || null;
    const rows = from || to
      ? collection.rows.filter((row) =>
          (!from || row.plannedDeliveryDate >= from) && (!to || row.plannedDeliveryDate <= to))
      : collection.rows;

    const normalizedBarcodes = [
      ...new Set(
        rows
          .map((row) => normalizeBarcode(row.barcode))
          .filter((barcode) => barcode.length > 0),
      ),
    ];
    // 바코드 매칭용 SKU 와 이름매칭용 전체 SKU 를 병렬 조회한다(순차 대비 지연 절감).
    const [skus, allSkusForName] = await Promise.all([
      normalizedBarcodes.length > 0
        ? this.evidence.findByNormalizedBarcodes(input.organizationId, normalizedBarcodes)
        : Promise.resolve([]),
      rows.length > 0
        ? this.evidence.listActiveForMatching(input.organizationId)
        : Promise.resolve([]),
    ]);

    const stockByBarcode = new Map<string, { name: string; stock: number }>();
    for (const sku of skus) {
      const key = normalizeBarcode(sku.barcode);
      if (!key) continue;
      const existing = stockByBarcode.get(key);
      if (existing) existing.stock += sku.currentStock;
      else stockByBarcode.set(key, { name: sku.name, stock: sku.currentStock });
    }

    // 이름 매칭 인덱스(완전일치 Map + bigram 버킷)를 한 번만 만든다 — 행마다 전수 스캔하지 않는다.
    const nameIndex = buildNameMatchIndex(
      allSkusForName
        .map((sku) => ({
          core: normalizeCoupangName(sku.name),
          price: coupangNamePrice(sku.name),
          stock: sku.currentStock,
          name: sku.name,
        }))
        .filter((entry) => entry.core.length >= 2),
    );

    return rows.map((row) => {
      const base = {
        poLineId: row.poLineId,
        poNumber: row.poNumber,
        productName: row.productName,
        barcode: row.barcode,
        orderQuantity: row.orderQty,
        plannedDeliveryDate: row.plannedDeliveryDate,
      };
      const key = normalizeBarcode(row.barcode);
      const barcodeMatch = key ? stockByBarcode.get(key) : undefined;
      if (barcodeMatch) {
        return { ...base, matched: true, matchType: 'barcode' as const, sellpiaName: barcodeMatch.name, currentStock: barcodeMatch.stock };
      }
      // 바코드 실패 → 이름 매칭(완전→포함→퍼지+가격가드).
      const nameMatch = matchCoupangProductByName(
        normalizeCoupangName(row.productName),
        coupangNamePrice(row.productName),
        nameIndex,
      );
      if (nameMatch) {
        return {
          ...base,
          matched: true,
          matchType: (nameMatch.fuzzy ? 'name-fuzzy' : 'name') as 'name' | 'name-fuzzy',
          sellpiaName: nameMatch.name,
          currentStock: nameMatch.stock,
        };
      }
      return { ...base, matched: false, matchType: null, sellpiaName: null, currentStock: null };
    });
  }
}

function isCompleteCollection(request: RocketPurchasePreviewRequest): boolean {
  const evidence = request.collection;
  const rowPoNumbers = new Set(request.rows.map(({ poNumber }) => poNumber));
  const requiresVendorEvidence = request.rows.length > 0;
  return (!requiresVendorEvidence || evidence.vendorId.length > 0)
    && !evidence.truncated
    && evidence.failedPoNumbers.length === 0
    && evidence.listPagesRead < 20
    && evidence.detailPoCount < 40
    && evidence.totalListPages <= evidence.listPagesRead
    && evidence.detailPoCount === rowPoNumbers.size
    && (!requiresVendorEvidence
      || request.rows.every(({ vendorId }) => vendorId === evidence.vendorId));
}

function canonicalArtifactHash(
  request: RocketPurchasePreviewRequest,
  vendorId: string,
  rows: RocketPoCatalogRow[],
): string {
  const canonical = JSON.stringify({
    collection: {
      vendorId,
      listPagesRead: request.collection.listPagesRead,
      totalListPages: request.collection.totalListPages,
      truncated: request.collection.truncated,
      detailPoCount: request.collection.detailPoCount,
      failedPoNumbers: [...request.collection.failedPoNumbers].sort(),
    },
    rows,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
