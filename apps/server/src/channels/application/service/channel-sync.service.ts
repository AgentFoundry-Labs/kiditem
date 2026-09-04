import {
  Injectable,
  Logger,
  NotImplementedException,
  Inject,
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

@Injectable()
export class ChannelSyncService {
  private readonly logger = new Logger(ChannelSyncService.name);

  constructor(
    @Inject(CHANNEL_SYNC_REPOSITORY_PORT)
    private readonly syncRepository: ChannelSyncRepositoryPort,
    private readonly channelAccounts: ChannelAccountService,
    @Inject(COUPANG_PROVIDER_PORT) private readonly coupang: CoupangProviderPort,
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

}
