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
  parseCoupangPackSize,
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
    const [barcodeSkus, allSkusForName] = await Promise.all([
      normalizedBarcodes.length > 0
        ? this.evidence.findByNormalizedBarcodes(input.organizationId, normalizedBarcodes)
        : Promise.resolve([]),
      rows.length > 0
        ? this.evidence.listActiveForMatching(input.organizationId)
        : Promise.resolve([]),
    ]);

    // 바코드 자원: 정규화 바코드가 여러 SKU(쿠팡용/일반)에 걸리면 재고를 합산하고 SKU id 를 모은다.
    const barcodeResource = new Map<string, { skuIds: string[]; name: string; stock: number }>();
    for (const sku of barcodeSkus) {
      const key = normalizeBarcode(sku.barcode);
      if (!key) continue;
      const existing = barcodeResource.get(key);
      if (existing) {
        existing.stock += sku.currentStock;
        existing.skuIds.push(sku.sellpiaInventorySkuId);
      } else {
        barcodeResource.set(key, { skuIds: [sku.sellpiaInventorySkuId], name: sku.name, stock: sku.currentStock });
      }
    }

    // 이름 매칭 인덱스(완전일치 Map + bigram 버킷) — 행마다 전수 스캔하지 않는다. skuId 포함.
    const nameIndex = buildNameMatchIndex(
      allSkusForName
        .map((sku) => ({
          core: normalizeCoupangName(sku.name),
          price: coupangNamePrice(sku.name),
          stock: sku.currentStock,
          name: sku.name,
          skuId: sku.sellpiaInventorySkuId,
        }))
        .filter((entry) => entry.core.length >= 2),
    );

    // 1차: 행별 매칭 자원 결정(바코드→이름→퍼지). 자원 키로 묶어 뒤에서 공동 할당한다.
    type RowMatch = {
      resourceKey: string;
      skuIds: string[];
      sellpiaName: string;
      matchType: 'barcode' | 'name' | 'name-fuzzy';
      stock: number;
    };
    const rowMatches = new Map<string, RowMatch>();
    for (const row of rows) {
      const key = normalizeBarcode(row.barcode);
      const group = key ? barcodeResource.get(key) : undefined;
      if (group) {
        rowMatches.set(row.poLineId, {
          resourceKey: `bc:${key}`, skuIds: group.skuIds, sellpiaName: group.name, matchType: 'barcode', stock: group.stock,
        });
        continue;
      }
      const nameMatch = matchCoupangProductByName(
        normalizeCoupangName(row.productName),
        coupangNamePrice(row.productName),
        nameIndex,
      );
      if (nameMatch) {
        rowMatches.set(row.poLineId, {
          resourceKey: `sku:${nameMatch.skuId}`,
          skuIds: [nameMatch.skuId],
          sellpiaName: nameMatch.name,
          matchType: nameMatch.fuzzy ? 'name-fuzzy' : 'name',
          stock: nameMatch.stock,
        });
      }
    }

    // 관여한 SKU 의 활성 약정을 한 번에 조회 → 자원별 availableStock(= 현재고 - 약정) 계산.
    const involvedSkuIds = [...new Set([...rowMatches.values()].flatMap((m) => m.skuIds))];
    const commitmentBySku = involvedSkuIds.length > 0
      ? await this.evidence.getActiveCommitmentBySkuIds(input.organizationId, involvedSkuIds)
      : {};
    const resource = new Map<string, {
      currentStock: number; activeCommitment: number; availableStock: number; remaining: number;
    }>();
    for (const match of rowMatches.values()) {
      if (resource.has(match.resourceKey)) continue;
      const commitment = match.skuIds.reduce((sum, id) => sum + (commitmentBySku[id] ?? 0), 0);
      const available = Math.max(0, match.stock - commitment);
      resource.set(match.resourceKey, {
        currentStock: match.stock, activeCommitment: commitment, availableStock: available, remaining: available,
      });
    }

    // 공동 할당: poLineId 순서로 각 자원의 availableStock 을 소진(팩 환산). 합이 가용재고 초과 못함.
    const confirmByLineId = new Map<string, number>();
    for (const row of [...rows].sort((a, b) => a.poLineId.localeCompare(b.poLineId))) {
      const match = rowMatches.get(row.poLineId);
      if (!match) continue;
      const info = resource.get(match.resourceKey)!;
      const packSize = parseCoupangPackSize(row.productName);
      const confirm = Math.min(row.orderQty, Math.floor(info.remaining / packSize));
      info.remaining -= confirm * packSize;
      confirmByLineId.set(row.poLineId, confirm);
    }

    return rows.map((row) => {
      const packSize = parseCoupangPackSize(row.productName);
      const base = {
        poLineId: row.poLineId,
        poNumber: row.poNumber,
        productName: row.productName,
        barcode: row.barcode,
        orderQuantity: row.orderQty,
        plannedDeliveryDate: row.plannedDeliveryDate,
        packSize,
      };
      const match = rowMatches.get(row.poLineId);
      if (!match) {
        return {
          ...base, matched: false, matchType: null, sellpiaName: null,
          currentStock: null, activeCommitmentQuantity: null, availableStock: null, confirmQuantity: 0,
        };
      }
      const info = resource.get(match.resourceKey)!;
      return {
        ...base,
        matched: true,
        matchType: match.matchType,
        sellpiaName: match.sellpiaName,
        currentStock: info.currentStock,
        activeCommitmentQuantity: info.activeCommitment,
        availableStock: info.availableStock,
        confirmQuantity: confirmByLineId.get(row.poLineId) ?? 0,
      };
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
