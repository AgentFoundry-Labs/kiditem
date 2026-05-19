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

  try {
    const dateTo = to ?? new Date();
    const dateFrom =
      from ?? new Date(dateTo.getTime() - 7 * 24 * 60 * 60 * 1000);

    const response = await deps.coupang.getOrderSheets(organizationId, {
      createdAtFrom: deps.formatOrderDate(dateFrom),
      createdAtTo: deps.formatOrderDate(dateTo),
      maxPerPage: 50,
    });

    if (response.code === 'ERROR') {
      return {
        synced: 0,
        errors: 1,
        details: [`API 에러: ${response.message}`],
      };
    }

    const orders = response.data ?? [];

    for (const order of orders) {
      try {
        await deps.syncRepository.syncSingleOrder(organizationId, order);
        result.synced++;
      } catch (error: unknown) {
        result.errors++;
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        result.details?.push(`주문 ${order.shipmentBoxId}: ${message}`);
        deps.logger.error(
          `Failed to sync order ${order.shipmentBoxId}: ${message}`,
        );
      }
    }
  } catch (error: unknown) {
    if (isCoupangCredentialResolutionError(error)) throw error;
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    result.errors++;
    result.details?.push(`전체 동기화 오류: ${message}`);
    deps.logger.error(`Order sync failed: ${message}`);
  }

  deps.logger.log(
    `Order sync complete: ${result.synced} synced, ${result.errors} errors`,
  );
  return result;
}

export function syncSingleCoupangOrder(
  syncRepository: ChannelSyncRepositoryPort,
  payload: CoupangSyncOrderPayload,
  organizationId: string,
): Promise<void> {
  return syncRepository.syncSingleOrder(organizationId, payload);
}
