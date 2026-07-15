import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { kstBusinessDate } from '../../../common/kst';
import {
  TAOBAO_LIVE_PORT,
  type TaobaoLivePort,
} from '../port/out/provider/taobao-live.port';
import {
  LIVE_COMMERCE_REPOSITORY_PORT,
  type LiveCommerceBroadcastSnapshotUpsert,
  type LiveCommerceProductSnapshotUpsert,
  type LiveCommerceRepositoryPort,
  type LiveCommerceSource,
} from '../port/out/repository/live-commerce.repository.port';

const EXTENSION_SOURCES = ['1688', 'douyin'] as const;
type ExtensionLiveCommerceSource = (typeof EXTENSION_SOURCES)[number];

export interface ExtensionLiveCommerceIngestInput {
  source: ExtensionLiveCommerceSource;
  pageUrl: string;
  broadcast: {
    broadcastId: string;
    title?: string;
    broadcasterId?: string;
    broadcasterName?: string;
    status?: string;
    viewerCount?: number;
    likeCount?: number;
    startedAt?: string;
    endedAt?: string;
    coverImageUrl?: string;
  };
  products: Array<{
    productId: string;
    rank?: number;
    title?: string;
    priceCny?: number;
    salesCount?: number;
    imageUrl?: string;
    sourceUrl?: string;
  }>;
}

@Injectable()
export class LiveCommerceService {
  constructor(
    @Inject(TAOBAO_LIVE_PORT)
    private readonly taobao: TaobaoLivePort,
    @Inject(LIVE_COMMERCE_REPOSITORY_PORT)
    private readonly repository: LiveCommerceRepositoryPort,
  ) {}

  async status(organizationId: string) {
    const [broadcasts, products] = await Promise.all([
      this.repository.findBroadcastSnapshots({ organizationId, days: 7 }),
      this.repository.findProductSnapshots({ organizationId, days: 7 }),
    ]);
    const latestBySource = new Map<LiveCommerceSource, Date>();
    for (const row of [...broadcasts, ...products]) {
      const current = latestBySource.get(row.source);
      if (!current || row.capturedAt > current) latestBySource.set(row.source, row.capturedAt);
    }
    const readiness = this.taobao.readiness();
    return {
      sources: [
        {
          source: 'taobao' as const,
          connection: 'official-api' as const,
          configured: readiness.configured,
          missing: readiness.missing,
          requiresLogin: false,
          latestCapturedAt: latestBySource.get('taobao')?.toISOString() ?? null,
        },
        {
          source: '1688' as const,
          connection: 'chrome-extension' as const,
          configured: true,
          missing: [],
          requiresLogin: true,
          latestCapturedAt: latestBySource.get('1688')?.toISOString() ?? null,
        },
        {
          source: 'douyin' as const,
          connection: 'chrome-extension' as const,
          configured: true,
          missing: [],
          requiresLogin: true,
          latestCapturedAt: latestBySource.get('douyin')?.toISOString() ?? null,
        },
      ],
    };
  }

  async collectTaobao(
    organizationId: string,
    input: { queryDate?: string; liveIds?: string[]; pageSize?: number },
  ) {
    const capturedAt = new Date();
    const businessDate = kstBusinessDate(capturedAt);
    const queryDate = input.queryDate ?? formatChinaCalendarDate(capturedAt);
    const result = await this.taobao.collect({
      queryDate,
      liveIds: input.liveIds ?? [],
      pageSize: input.pageSize ?? 100,
    });
    const broadcasts: LiveCommerceBroadcastSnapshotUpsert[] = result.rooms.map((room) => ({
      organizationId,
      businessDate,
      source: 'taobao',
      ...room,
      capturedAt,
    }));
    const products: LiveCommerceProductSnapshotUpsert[] = result.products.map((product) => ({
      organizationId,
      businessDate,
      source: 'taobao',
      ...product,
      capturedAt,
    }));
    const [broadcastCount, productCount] = await Promise.all([
      this.repository.upsertBroadcastSnapshots(broadcasts),
      this.repository.upsertProductSnapshots(products),
    ]);
    return {
      businessDate: toDateString(businessDate),
      broadcastCount,
      productCount,
      warnings: result.warnings,
    };
  }

  async ingestExtension(
    organizationId: string,
    input: ExtensionLiveCommerceIngestInput,
  ) {
    assertSourcePageUrl(input.source, input.pageUrl);
    const capturedAt = new Date();
    const businessDate = kstBusinessDate(capturedAt);
    const broadcastId = input.broadcast.broadcastId.trim();
    const broadcast: LiveCommerceBroadcastSnapshotUpsert = {
      organizationId,
      businessDate,
      source: input.source,
      broadcastId,
      title: optionalText(input.broadcast.title),
      broadcasterId: optionalText(input.broadcast.broadcasterId),
      broadcasterName: optionalText(input.broadcast.broadcasterName),
      status: optionalText(input.broadcast.status),
      viewerCount: nonNegativeInteger(input.broadcast.viewerCount),
      likeCount: nonNegativeInteger(input.broadcast.likeCount),
      startedAt: optionalDate(input.broadcast.startedAt),
      endedAt: optionalDate(input.broadcast.endedAt),
      coverImageUrl: optionalHttpUrl(input.broadcast.coverImageUrl),
      sourceUrl: input.pageUrl,
      capturedAt,
    };
    const seen = new Set<string>();
    const products: LiveCommerceProductSnapshotUpsert[] = [];
    for (const [index, item] of input.products.entries()) {
      const productId = item.productId.trim();
      if (!productId || seen.has(productId)) continue;
      seen.add(productId);
      products.push({
        organizationId,
        businessDate,
        source: input.source,
        broadcastId,
        productId,
        rank: nonNegativeInteger(item.rank) ?? index + 1,
        title: optionalText(item.title),
        priceCny: nonNegativeNumber(item.priceCny),
        salesCount: nonNegativeInteger(item.salesCount),
        imageUrl: optionalHttpUrl(item.imageUrl),
        sourceUrl: optionalSourceProductUrl(input.source, item.sourceUrl),
        capturedAt,
      });
    }
    const [broadcastCount, productCount] = await Promise.all([
      this.repository.upsertBroadcastSnapshots([broadcast]),
      this.repository.upsertProductSnapshots(products),
    ]);
    return {
      businessDate: toDateString(businessDate),
      source: input.source,
      broadcastCount,
      productCount,
    };
  }

  async list(
    organizationId: string,
    input: { days: number; source?: LiveCommerceSource },
  ) {
    const [broadcastRows, productRows] = await Promise.all([
      this.repository.findBroadcastSnapshots({ organizationId, ...input }),
      this.repository.findProductSnapshots({ organizationId, ...input }),
    ]);
    const broadcasts = latestRows(broadcastRows, (row) => `${row.source}\u0000${row.broadcastId}`).map((row) => ({
      ...row,
      businessDate: toDateString(row.businessDate),
      capturedAt: row.capturedAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
    }));
    const products = latestRows(
      productRows,
      (row) => `${row.source}\u0000${row.broadcastId}\u0000${row.productId}`,
    ).map((row) => ({
      ...row,
      businessDate: toDateString(row.businessDate),
      capturedAt: row.capturedAt.toISOString(),
    }));
    return { days: input.days, broadcasts, products };
  }
}

function assertSourcePageUrl(source: ExtensionLiveCommerceSource, rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('라이브 방송 URL이 올바르지 않습니다.');
  }
  if (url.protocol !== 'https:') {
    throw new BadRequestException('라이브 방송은 HTTPS URL만 수집할 수 있습니다.');
  }
  const host = url.hostname.toLowerCase();
  const valid = source === '1688' ? isHost(host, '1688.com') : isHost(host, 'douyin.com');
  if (!valid) throw new BadRequestException(`${source} 라이브 방송 URL과 수집 소스가 일치하지 않습니다.`);
}

function optionalSourceProductUrl(source: ExtensionLiveCommerceSource, rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const valid = source === '1688'
      ? isHost(host, '1688.com')
      : isHost(host, 'douyin.com') || isHost(host, 'jinritemai.com');
    return valid ? url.toString() : null;
  } catch {
    return null;
  }
}

function isHost(host: string, root: string): boolean {
  return host === root || host.endsWith(`.${root}`);
}

function optionalText(value: string | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function optionalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nonNegativeNumber(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonNegativeInteger(value: number | undefined): number | null {
  const number = nonNegativeNumber(value);
  return number === null ? null : Math.trunc(number);
}

function formatChinaCalendarDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}${read('month')}${read('day')}`;
}

function latestRows<T extends { capturedAt: Date }>(rows: T[], keyOf: (row: T) => string): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = latest.get(key);
    if (!current || row.capturedAt > current.capturedAt) latest.set(key, row);
  }
  return [...latest.values()].sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
