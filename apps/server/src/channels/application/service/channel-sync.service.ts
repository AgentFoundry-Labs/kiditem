import {
  Injectable,
  Logger,
  NotImplementedException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  COUPANG_PROVIDER_PORT,
  type CoupangProviderPort,
} from '../port/out/coupang-provider.port';
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

/**
 * Coupang raw status → 내부 canonical status 정규화. 현재 `NONE_TRACKING` (송장없는 배송)
 * 만 매핑 (DEPARTURE = 출고완료 와 동일 의미). UI pipeline 5-stage bucket 과 정합 유지.
 */
export function normalizeCoupangOrderStatus(raw: string | null | undefined): string | undefined {
  if (raw === 'NONE_TRACKING') return 'DEPARTURE';
  return raw ?? undefined;
}

/**
 * Coupang seller_product `statusName` → 내부 ChannelListing `status`.
 * 새 raw status 는 lowercase fallback 으로 통과시키되, 매핑된 값은 product UI / strategy
 * 에서 안정적으로 쿼리할 수 있는 canonical 값으로 정규화한다. C1 — Wave C.
 */
function normalizeCoupangProductStatus(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) return undefined;
  switch (raw) {
    case 'APPROVED':
    case 'ON_SALE':
      return 'active';
    case 'SUSPEND':
      return 'paused';
    case 'DELETED':
      return 'deleted';
    case 'UNDER_EXAMINATION':
    case 'REJECTED':
      return 'draft';
    default:
      return raw.toLowerCase();
  }
}

/**
 * Coupang KR market timestamp formatter. UTC instant 을 KST wall-clock 으로 변환하고
 * `+09:00` offset 을 명시한다. 예: `new Date('2026-04-25T00:30:00.000Z')`
 * (KST 09:30) → `'2026-04-25T09:30:00+09:00'`.
 */
export function formatKstIso(d: Date): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+09:00`;
}

@Injectable()
export class ChannelSyncService {
  private readonly logger = new Logger(ChannelSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
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
        prisma: this.prisma,
        coupang: this.coupang,
        logger: this.logger,
        normalizeProductStatus: normalizeCoupangProductStatus,
      },
      organizationId,
    );
  }

  async syncOrders(organizationId: string, from?: Date, to?: Date): Promise<SyncResult> {
    return syncCoupangOrders(
      {
        prisma: this.prisma,
        coupang: this.coupang,
        logger: this.logger,
        formatOrderDate: formatKstIso,
        normalizeOrderStatus: normalizeCoupangOrderStatus,
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
      this.prisma,
      payload,
      organizationId,
      normalizeCoupangOrderStatus,
    );
  }

  private async syncSingleReturn(
    payload: CoupangSyncReturnPayload,
    organizationId: string,
  ): Promise<void> {
    return syncSingleCoupangReturn(this.prisma, payload, organizationId);
  }
}
