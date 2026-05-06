import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ChannelReconciliationService,
  type ReconciliationRowInput,
} from './channel-reconciliation.service';
import type { ReconciliationScanResponse } from '@kiditem/shared/channel-reconciliation';

const RECONCILIATION_CHANNEL = 'coupang';
const SNAPSHOT_SYNC_LIMIT = 5_000;

type JsonMap = { [key: string]: unknown };

interface SnapshotRow {
  pageType: string | null;
  externalId: string | null;
  externalOptionId: string | null;
  rawJson: unknown;
  normalizedJson: unknown;
}

@Injectable()
export class ChannelReconciliationSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: ChannelReconciliationService,
  ) {}

  async syncFromSnapshots(organizationId: string): Promise<ReconciliationScanResponse> {
    const snapshots = await this.prisma.channelScrapeSnapshot.findMany({
      where: {
        organizationId,
        channel: RECONCILIATION_CHANNEL,
        matchStatus: 'unmatched',
        externalId: { not: null },
      },
      orderBy: [{ observedAt: 'desc' }, { createdAt: 'desc' }],
      take: SNAPSHOT_SYNC_LIMIT,
      select: {
        pageType: true,
        externalId: true,
        externalOptionId: true,
        rawJson: true,
        normalizedJson: true,
      },
    });

    const rows = this.toLatestRows(snapshots);
    if (rows.length === 0) {
      throw new BadRequestException('동기화할 미매칭 쿠팡 데이터가 없습니다');
    }

    return this.reconciliation.scanFromRows(organizationId, rows, 'wing_inventory');
  }

  private toLatestRows(snapshots: SnapshotRow[]): ReconciliationRowInput[] {
    const seen = new Set<string>();
    const rows: ReconciliationRowInput[] = [];

    for (const snapshot of snapshots) {
      const row = this.toReconciliationRow(snapshot);
      if (!row) continue;

      const itemKey = row.externalOptionId
        ? `option:${row.externalId}:${row.externalOptionId}`
        : `listing:${row.externalId}`;
      if (seen.has(itemKey)) continue;
      seen.add(itemKey);
      rows.push(row);
    }

    return rows;
  }

  private toReconciliationRow(snapshot: SnapshotRow): ReconciliationRowInput | null {
    const raw = asJsonMap(snapshot.rawJson);
    const normalized = asJsonMap(snapshot.normalizedJson);
    const pageType =
      cleanString(snapshot.pageType) ??
      pickString(normalized, ['pageType']) ??
      pickString(raw, ['pageType']);
    if (pageType?.toLowerCase() === 'campaign') return null;

    const canonicalExternalId =
      pickString(normalized, ['productId', 'sellerProductId', 'externalProductId']) ??
      pickString(raw, ['productId', 'sellerProductId', 'externalProductId']);
    const snapshotExternalId = cleanString(snapshot.externalId);
    const externalId =
      canonicalExternalId ??
      (isCoupangNumericId(snapshotExternalId) ? snapshotExternalId : null);
    if (!externalId) return null;

    const externalOptionId =
      cleanString(snapshot.externalOptionId) ??
      pickString(normalized, ['externalOptionId', 'vendorItemId', 'sellerProductItemId', 'itemId']) ??
      pickString(raw, ['externalOptionId', 'vendorItemId', 'sellerProductItemId', 'itemId']);

    const channelProductName =
      pickString(normalized, ['productName', 'channelProductName']) ??
      pickString(raw, ['productName', 'sellerProductName', 'channelProductName']);
    if (!externalOptionId && !channelProductName) return null;

    return {
      externalId,
      externalOptionId,
      legacyCode: pickString(normalized, ['legacyCode', 'legacy_code']) ??
        pickString(raw, ['legacyCode', 'legacy_code']),
      channelProductName,
      channelOptionName:
        pickString(normalized, ['optionName', 'channelOptionName']) ??
        pickString(raw, ['optionName', 'itemName', 'sellerProductItemName', 'channelOptionName']),
      channelImageUrl:
        pickString(normalized, ['imageUrl', 'channelImageUrl']) ??
        pickString(raw, ['imageUrl', 'thumbnailUrl', 'channelImageUrl']),
      channelUrl:
        pickString(normalized, ['productUrl', 'channelUrl']) ??
        pickString(raw, ['productUrl', 'channelUrl']),
      channelStatus:
        pickString(normalized, ['status', 'saleStatus', 'channelStatus']) ??
        pickString(raw, ['status', 'saleStatus', 'channelStatus']),
    };
  }
}

function asJsonMap(value: unknown): JsonMap | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonMap;
}

function pickString(source: JsonMap | null, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = cleanString(source[key]);
    if (value) return value;
  }
  return null;
}

function isCoupangNumericId(value: string | null): boolean {
  return value ? /^\d+$/.test(value) : false;
}

function cleanString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}
