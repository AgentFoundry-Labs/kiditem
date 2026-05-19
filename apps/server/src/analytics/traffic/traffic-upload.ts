import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { MulterFile } from '../../common/types';
import { kstDayStart } from '../../common/kst';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OperationAlertPort } from './application/port/out/cross-domain/operation-alert.port';
import {
  parseTrafficUploadFile,
  type ParsedUploadRow,
} from './traffic-upload.parser';

type TrafficUploadSource = 'settings' | 'products';

export interface TrafficUploadOptions {
  actorUserId?: string | null;
  source?: string | null;
}

interface UploadTrafficStatsParams {
  file: MulterFile;
  organizationId: string;
  options: TrafficUploadOptions;
  prisma: PrismaService;
  operationAlerts?: OperationAlertPort;
}

interface AggregatedRow {
  listingId: string;
  externalId: string;
  rawSnapshotId: string | null;
  visitors: number;
  views: number;
  cartAdds: number;
  orders: number;
  salesQty: number;
  revenue: number;
  date: string;
}

const TRAFFIC_UPLOAD_SURFACES: Record<TrafficUploadSource, { href: string }> = {
  settings: { href: '/settings' },
  products: { href: '/products' },
};

export async function uploadTrafficStats({
  file,
  organizationId,
  options,
  prisma,
  operationAlerts,
}: UploadTrafficStatsParams) {
  const source = normalizeTrafficUploadSource(options.source);
  const operationKey = `traffic-upload:${source}`;
  const href = TRAFFIC_UPLOAD_SURFACES[source].href;
  await operationAlerts?.start({
    organizationId,
    operationKey,
    type: 'traffic_upload',
    title: '트래픽 데이터 업로드',
    sourceType: 'traffic_upload',
    sourceId: source,
    actorUserId: options.actorUserId ?? null,
    href,
    message: 'Wing 트래픽 엑셀 데이터를 업로드하고 있습니다.',
    progress: 0,
    metadata: {
      source,
      fileName: file.originalname,
      fileSize: file.size,
    },
  });

  try {
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('파일 크기 10MB 초과');
    }

    // Coupang 의 '등록상품ID' 는 ChannelListing.externalId 에 해당.
    // CSV upload 는 Coupang 전용이므로 channel='coupang' 로 제한.
    const listings = await prisma.channelListing.findMany({
      where: { organizationId, isDeleted: false, channel: 'coupang' },
      select: { id: true, externalId: true },
    });
    const listingMap = new Map<string, string>(
      listings.map((l) => [l.externalId, l.id]),
    );

    const todayKst = kstDayStart(new Date());
    const todayStr = todayKst.toISOString().slice(0, 10);
    const parsed = parseTrafficUploadFile({
      file,
      listingMap,
      todayStr,
    });

    const observedAt = new Date();
    let upserted = 0;

    if (parsed.rows.length > 0) {
      // Persist a `ChannelScrapeRun` + per-row `ChannelScrapeSnapshot` so the
      // raw upload is auditable / replay-able the same way extension-sync
      // payloads are. Raw capture is committed before normalization so daily
      // upsert failures never erase audit/replay rows.
      const run = await prisma.channelScrapeRun.create({
        data: {
          organizationId,
          channel: 'coupang',
          source: 'traffic_csv_upload',
          pageType: 'traffic',
          businessDate: todayKst,
          status: 'running',
          rowCount: parsed.rowCount,
          metaJson: {
            detectedColumns: parsed.detectedColumns,
            fileName: file.originalname,
          } as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      let matchedRows = 0;
      const unmatchedRows = parsed.skipped;
      const aggregated = new Map<string, AggregatedRow>();

      for (const row of parsed.rows) {
        const businessDate = row.date ? new Date(row.date) : null;
        const snapshot = await prisma.channelScrapeSnapshot.create({
          data: {
            organizationId,
            scrapeRunId: run.id,
            channel: 'coupang',
            source: 'traffic_csv_upload',
            pageType: 'traffic',
            businessDate,
            externalId: row.externalId,
            listingId: row.listingId,
            matchStatus: row.matchStatus,
            matchReason: row.matchReason,
            rawJson: row.raw as Prisma.InputJsonValue,
            normalizedJson:
              row.matchStatus === 'matched'
                ? ({
                    visitors: row.visitors,
                    views: row.views,
                    cartAdds: row.cartAdds,
                    orders: row.orders,
                    salesQty: row.salesQty,
                    revenue: row.revenue,
                  } as Prisma.InputJsonValue)
                : Prisma.DbNull,
          },
          select: { id: true },
        });

        if (
          row.matchStatus !== 'matched' ||
          !row.listingId ||
          !row.externalId ||
          !row.date
        ) {
          continue;
        }
        matchedRows += 1;
        addAggregatedRow(aggregated, row, snapshot.id);
      }

      const dataArr = [...aggregated.values()];
      try {
        await prisma.$transaction(async (tx) => {
          for (const d of dataArr) {
            const businessDate = new Date(d.date);
            // Daily-fact upsert — overwrite-on-replay metric semantics so a
            // re-upload of the same day yields the same totals (idempotent).
            await tx.channelListingDailySnapshot.upsert({
              where: {
                organizationId_listingId_businessDate: {
                  organizationId,
                  listingId: d.listingId,
                  businessDate,
                },
              },
              create: {
                organizationId,
                listingId: d.listingId,
                channel: 'coupang',
                externalId: d.externalId,
                businessDate,
                sampleCount: 1,
                firstObservedAt: observedAt,
                lastObservedAt: observedAt,
                rawSnapshotId: d.rawSnapshotId,
                trafficVisitors: d.visitors,
                trafficViews: d.views,
                trafficCartAdds: d.cartAdds,
                trafficOrders: d.orders,
                trafficSalesQty: d.salesQty,
                trafficRevenue: d.revenue,
                metaJson: {
                  'traffic.csv_upload': {
                    source: 'traffic_csv_upload',
                    data: {
                      fileName: file.originalname,
                      uploadedAt: observedAt.toISOString(),
                    },
                  },
                } as Prisma.InputJsonValue,
              },
              update: {
                sampleCount: { increment: 1 },
                lastObservedAt: observedAt,
                rawSnapshotId: d.rawSnapshotId,
                trafficVisitors: d.visitors,
                trafficViews: d.views,
                trafficCartAdds: d.cartAdds,
                trafficOrders: d.orders,
                trafficSalesQty: d.salesQty,
                trafficRevenue: d.revenue,
              },
            });
          }
        });
      } catch (err) {
        await updateScrapeRunOrThrow(prisma, run.id, organizationId, {
          status: 'error',
          matchedCount: matchedRows,
          unmatchedCount: unmatchedRows,
          errorCount: 1,
          errorJson: {
            message: err instanceof Error ? err.message : String(err),
            name: err instanceof Error ? err.name : 'Error',
          } as Prisma.InputJsonValue,
          finishedAt: new Date(),
        });
        throw err;
      }

      upserted = dataArr.length;
      await updateScrapeRunOrThrow(prisma, run.id, organizationId, {
        status: 'complete',
        matchedCount: matchedRows,
        unmatchedCount: unmatchedRows,
        finishedAt: new Date(),
      });
    }

    const response = {
      success: true,
      upserted,
      skipped: parsed.skipped,
      detectedColumns: parsed.detectedColumns,
    };
    await operationAlerts?.succeed(organizationId, operationKey, {
      href,
      message: `트래픽 데이터 업로드 완료: ${upserted}건 반영, ${parsed.skipped}건 스킵`,
      severity: parsed.skipped > 0 ? 'warning' : 'info',
      metadata: {
        source,
        fileName: file.originalname,
        upserted,
        skipped: parsed.skipped,
      },
    });
    return response;
  } catch (err) {
    await operationAlerts?.fail(organizationId, operationKey, {
      href,
      message: `트래픽 데이터 업로드 실패: ${errorMessage(err)}`,
      metadata: {
        source,
        fileName: file.originalname,
        error: errorMessage(err),
      },
    });
    throw err;
  }
}

function normalizeTrafficUploadSource(
  source: string | null | undefined,
): TrafficUploadSource {
  return source === 'products' ? 'products' : 'settings';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function addAggregatedRow(
  aggregated: Map<string, AggregatedRow>,
  parsed: ParsedUploadRow,
  rawSnapshotId: string,
) {
  if (!parsed.listingId || !parsed.externalId || !parsed.date) {
    return;
  }

  const { listingId, externalId, date } = parsed;
  const key = `${listingId}::${date}`;
  const existing = aggregated.get(key);
  if (existing) {
    existing.rawSnapshotId = rawSnapshotId;
    existing.visitors += parsed.visitors;
    existing.views += parsed.views;
    existing.cartAdds += parsed.cartAdds;
    existing.orders += parsed.orders;
    existing.salesQty += parsed.salesQty;
    existing.revenue += parsed.revenue;
  } else {
    aggregated.set(key, {
      listingId,
      externalId,
      rawSnapshotId,
      date,
      visitors: parsed.visitors,
      views: parsed.views,
      cartAdds: parsed.cartAdds,
      orders: parsed.orders,
      salesQty: parsed.salesQty,
      revenue: parsed.revenue,
    });
  }
}

async function updateScrapeRunOrThrow(
  prisma: PrismaService,
  id: string,
  organizationId: string,
  data: Prisma.ChannelScrapeRunUpdateManyMutationInput,
) {
  const result = await prisma.channelScrapeRun.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) {
    throw new NotFoundException('Scrape run not found');
  }
}
