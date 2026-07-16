import {
  Injectable,
  Logger,
  NotImplementedException,
  Inject,
  Optional,
} from '@nestjs/common';
import {
  COUPANG_PROVIDER_PORT,
  type CoupangProviderPort,
} from '../port/out/provider/coupang-provider.port';
import {
  CHANNEL_SYNC_REPOSITORY_PORT,
  type ChannelSyncRepositoryPort,
} from '../port/out/repository/channel-sync.repository.port';
import {
  formatKstIso,
  normalizeCoupangOrderStatus,
} from '../../domain/coupang-normalization';
import { ChannelAccountService } from './channel-account.service';
import {
  CHANNELS_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../port/out/cross-domain/operation-alert.port';
import { syncCoupangOrders, syncSingleCoupangOrder } from './channel-sync-order.service';
import { syncCoupangProducts } from './channel-sync-product.service';
import { syncSingleCoupangReturn } from './channel-sync-return.service';
import type {
  SyncResult,
  HealthResult,
  CoupangSyncOrderPayload,
  CoupangSyncReturnPayload,
} from './types';

export { formatKstIso, normalizeCoupangOrderStatus };

const PRODUCT_SYNC_ALERT = {
  operationKey: 'coupang-sync:products',
  type: 'coupang_product_sync',
  title: '쿠팡 상품 동기화',
  sourceType: 'coupang_sync',
  sourceId: 'products',
  href: '/inventory',
} as const;

const ORDER_SYNC_ALERT = {
  operationKey: 'coupang-sync:orders',
  type: 'coupang_order_sync',
  title: '쿠팡 주문 동기화',
  sourceType: 'coupang_sync',
  sourceId: 'orders',
  href: '/orders',
} as const;

function resultMessage(label: string, result: SyncResult): string {
  if (result.errors > 0) {
    return `${label} 완료: ${result.synced}건 처리, ${result.errors}건 확인 필요`;
  }
  return `${label} 완료: ${result.synced}건 처리`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

@Injectable()
export class ChannelSyncService {
  private readonly logger = new Logger(ChannelSyncService.name);

  constructor(
    @Inject(CHANNEL_SYNC_REPOSITORY_PORT)
    private readonly syncRepository: ChannelSyncRepositoryPort,
    private readonly channelAccounts: ChannelAccountService,
    @Inject(COUPANG_PROVIDER_PORT) private readonly coupang: CoupangProviderPort,
    @Optional()
    @Inject(CHANNELS_OPERATION_ALERT_PORT)
    private readonly operationAlerts?: OperationAlertPort,
  ) {}

  async checkHealth(organizationId: string): Promise<HealthResult> {
    try {
      const settings = await this.channelAccounts.getCoupangSettings(organizationId);
      if (!settings.configured) {
        return {
          connected: false,
          vendorId: settings.vendorId ?? '',
          error: '쿠팡 API 설정이 필요합니다.',
        };
      }

      const response = await this.coupang.getSellerProducts(organizationId, {
        maxPerPage: 1,
      });

      if (response.code === 'ERROR' || response.code === 'FORBIDDEN') {
        return {
          connected: false,
          vendorId: settings.vendorId ?? '',
          error: response.message || 'API 인증 실패',
        };
      }

      return { connected: true, vendorId: settings.vendorId ?? '' };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Health check failed: ${message}`);
      return {
        connected: false,
        vendorId: '',
        error: message,
      };
    }
  }

  async syncProducts(organizationId: string): Promise<SyncResult> {
    return syncCoupangProducts(
      {
        syncRepository: this.syncRepository,
        coupang: this.coupang,
        logger: this.logger,
      },
      organizationId,
    );
  }

  async syncProductsWithAlert(
    organizationId: string,
    actorUserId: string,
  ): Promise<SyncResult> {
    const alerts = this.requireOperationAlerts();
    await alerts.start({
      organizationId,
      actorUserId,
      ...PRODUCT_SYNC_ALERT,
      message: '쿠팡 상품 데이터를 동기화하는 중입니다.',
      progress: 0,
    });

    try {
      const result = await this.syncProducts(organizationId);
      await alerts.succeed(organizationId, PRODUCT_SYNC_ALERT.operationKey, {
        message: resultMessage('쿠팡 상품 동기화', result),
        href: PRODUCT_SYNC_ALERT.href,
        severity: result.errors > 0 ? 'warning' : 'info',
        metadata: {
          synced: result.synced,
          errors: result.errors,
          details: result.details ?? [],
        },
      });
      return result;
    } catch (error: unknown) {
      await alerts.fail(organizationId, PRODUCT_SYNC_ALERT.operationKey, {
        message: `쿠팡 상품 동기화 실패: ${errorMessage(error)}`,
        href: PRODUCT_SYNC_ALERT.href,
        metadata: { error: errorMessage(error) },
      });
      throw error;
    }
  }

  async syncOrders(organizationId: string, from?: Date, to?: Date): Promise<SyncResult> {
    return syncCoupangOrders(
      {
        syncRepository: this.syncRepository,
        coupang: this.coupang,
        logger: this.logger,
        formatOrderDate: formatKstIso,
      },
      organizationId,
      from,
      to,
    );
  }

  async syncOrdersWithAlert(
    organizationId: string,
    actorUserId: string,
    from?: Date,
    to?: Date,
  ): Promise<SyncResult> {
    const alerts = this.requireOperationAlerts();
    await alerts.start({
      organizationId,
      actorUserId,
      ...ORDER_SYNC_ALERT,
      message: '쿠팡 주문 데이터를 동기화하는 중입니다.',
      progress: 0,
      metadata: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
    });

    try {
      const result = await this.syncOrders(organizationId, from, to);
      await alerts.succeed(organizationId, ORDER_SYNC_ALERT.operationKey, {
        message: resultMessage('쿠팡 주문 동기화', result),
        href: ORDER_SYNC_ALERT.href,
        severity: result.errors > 0 ? 'warning' : 'info',
        metadata: {
          synced: result.synced,
          errors: result.errors,
          details: result.details ?? [],
        },
      });
      return result;
    } catch (error: unknown) {
      await alerts.fail(organizationId, ORDER_SYNC_ALERT.operationKey, {
        message: `쿠팡 주문 동기화 실패: ${errorMessage(error)}`,
        href: ORDER_SYNC_ALERT.href,
        metadata: { error: errorMessage(error) },
      });
      throw error;
    }
  }

  async syncInventory(_organizationId: string): Promise<SyncResult> {
    throw new NotImplementedException(
      'Inventory sync is not implemented yet — define the InventoryService single-writer boundary before adding channel inventory writes',
    );
  }

  private async syncSingleOrder(
    payload: CoupangSyncOrderPayload,
    organizationId: string,
  ): Promise<void> {
    return syncSingleCoupangOrder(
      this.syncRepository,
      payload,
      organizationId,
    );
  }

  private async syncSingleReturn(
    payload: CoupangSyncReturnPayload,
    organizationId: string,
  ): Promise<void> {
    return syncSingleCoupangReturn(this.syncRepository, payload, organizationId);
  }

  private requireOperationAlerts(): OperationAlertPort {
    if (!this.operationAlerts) {
      throw new Error('CHANNELS_OPERATION_ALERT_PORT is not configured');
    }
    return this.operationAlerts;
  }
}
