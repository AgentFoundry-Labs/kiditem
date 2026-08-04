import { type Logger } from '@nestjs/common';
import type { CoupangProviderPort } from '../port/out/provider/coupang-provider.port';
import type {
  ChannelSyncRepositoryPort,
  CoupangSyncOrderPayload,
  SyncResult,
} from '../port/out/repository/channel-sync.repository.port';
import { isCoupangCredentialResolutionError } from './channel-account.service';

type SyncLogger = Pick<Logger, 'error' | 'log'>;

interface OrderSyncDeps {
  syncRepository: ChannelSyncRepositoryPort;
  coupang: CoupangProviderPort;
  logger: SyncLogger;
  formatOrderDate(d: Date): string;
}

export async function syncCoupangOrders(
  deps: OrderSyncDeps,
  organizationId: string,
  from?: Date,
  to?: Date,
): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, errors: 0, details: [] };
  let sourceImportRunId: string | null = null;

  try {
    const dateTo = to ?? new Date();
    const dateFrom =
      from ?? new Date(dateTo.getTime() - 7 * 24 * 60 * 60 * 1000);

    const channelAccountId = await deps.syncRepository.getPrimaryCoupangAccountId(organizationId);
    if (!channelAccountId) {
      throw new Error('Active primary Coupang ChannelAccount is required for order sync');
    }
    sourceImportRunId = (await deps.syncRepository.startOrderImport({
      organizationId,
      channelAccountId,
    })).id;
    let nextToken: string | undefined;
    const seenTokens = new Set<string>();
    do {
      const response = await deps.coupang.getOrderSheets(organizationId, channelAccountId, {
        createdAtFrom: deps.formatOrderDate(dateFrom),
        createdAtTo: deps.formatOrderDate(dateTo),
        maxPerPage: 50,
        ...(nextToken ? { nextToken } : {}),
      });

      if (response.code === 'ERROR') {
        throw new Error(`API 에러: ${response.message}`);
      }

      for (const order of response.data ?? []) {
        try {
          await deps.syncRepository.syncSingleOrder(
            organizationId,
            channelAccountId,
            order,
            sourceImportRunId,
          );
          result.synced++;
        } catch (error: unknown) {
          result.errors++;
          const message = error instanceof Error ? error.message : 'Unknown error';
          result.details?.push(`주문 ${order.shipmentBoxId}: ${message}`);
          deps.logger.error(`Failed to sync order ${order.shipmentBoxId}: ${message}`);
        }
      }
      const candidate = response.nextToken?.trim() || undefined;
      if (candidate && seenTokens.has(candidate)) throw new Error('Coupang order pagination token repeated');
      if (candidate) seenTokens.add(candidate);
      nextToken = candidate;
    } while (nextToken);

    if (result.errors > 0) throw new Error(`${result.errors} order rows failed to publish`);
    const coverage = completeKstCalendarCoverage(dateFrom, dateTo);
    await deps.syncRepository.completeOrderImport({
      organizationId,
      sourceImportRunId,
      rowCount: result.synced,
      coverageStartDate: coverage?.from ?? null,
      coverageEndDate: coverage?.to ?? null,
    });
  } catch (error: unknown) {
    if (isCoupangCredentialResolutionError(error)) throw error;
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    if (result.errors === 0) result.errors++;
    result.details?.push(`전체 동기화 오류: ${message}`);
    deps.logger.error(`Order sync failed: ${message}`);
    if (sourceImportRunId) {
      await deps.syncRepository.failOrderImport({
        organizationId,
        sourceImportRunId,
        errorMessage: message,
      });
    }
  }

  deps.logger.log(
    `Order sync complete: ${result.synced} synced, ${result.errors} errors`,
  );
  return result;
}

function completeKstCalendarCoverage(from: Date, to: Date): { from: Date; to: Date } | null {
  const start = kstParts(from);
  const end = kstParts(to);
  const startDate = new Date(Date.UTC(start.year, start.month, start.day + (start.msOfDay === 0 ? 0 : 1)));
  const endDate = new Date(Date.UTC(end.year, end.month, end.day - (end.msOfDay === 86_399_999 ? 0 : 1)));
  return startDate <= endDate ? { from: startDate, to: endDate } : null;
}

function kstParts(date: Date) {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    msOfDay: shifted.getUTCHours() * 3_600_000
      + shifted.getUTCMinutes() * 60_000
      + shifted.getUTCSeconds() * 1_000
      + shifted.getUTCMilliseconds(),
  };
}

export async function syncSingleCoupangOrder(
  syncRepository: ChannelSyncRepositoryPort,
  payload: CoupangSyncOrderPayload,
  organizationId: string,
): Promise<void> {
  const channelAccountId = await syncRepository.getPrimaryCoupangAccountId(organizationId);
  if (!channelAccountId) {
    throw new Error('Active primary Coupang ChannelAccount is required for order sync');
  }
  return syncRepository.syncSingleOrder(organizationId, channelAccountId, payload);
}
