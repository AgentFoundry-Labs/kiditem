import { Controller, Get, Post, Body } from '@nestjs/common';
import { ChannelSyncService } from '../../../application/service/channel-sync.service';
import type { SyncResult } from '../../../application/service/types';
import { SyncOrdersBodyDto } from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { OperationAlertService } from '../../../../automation/application/service/operation-alert.service';

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

@Controller('coupang-sync')
export class ChannelSyncController {
  constructor(
    private readonly syncService: ChannelSyncService,
    private readonly operationAlerts: OperationAlertService,
  ) {}

  @Get('health')
  async checkHealth() {
    return this.syncService.checkHealth();
  }

  @Post('products')
  async syncProducts(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.operationAlerts.start({
      organizationId,
      actorUserId: user.id,
      ...PRODUCT_SYNC_ALERT,
      message: '쿠팡 상품 데이터를 동기화하는 중입니다.',
      progress: 0,
    });

    try {
      const result = await this.syncService.syncProducts(organizationId);
      await this.operationAlerts.succeed(organizationId, PRODUCT_SYNC_ALERT.operationKey, {
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
      await this.operationAlerts.fail(organizationId, PRODUCT_SYNC_ALERT.operationKey, {
        message: `쿠팡 상품 동기화 실패: ${errorMessage(error)}`,
        href: PRODUCT_SYNC_ALERT.href,
        metadata: { error: errorMessage(error) },
      });
      throw error;
    }
  }

  @Post('orders')
  async syncOrders(
    @Body() body: SyncOrdersBodyDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const from = body.from ? new Date(body.from) : undefined;
    const to = body.to ? new Date(body.to) : undefined;
    await this.operationAlerts.start({
      organizationId,
      actorUserId: user.id,
      ...ORDER_SYNC_ALERT,
      message: '쿠팡 주문 데이터를 동기화하는 중입니다.',
      progress: 0,
      metadata: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
    });

    try {
      const result = await this.syncService.syncOrders(organizationId, from, to);
      await this.operationAlerts.succeed(organizationId, ORDER_SYNC_ALERT.operationKey, {
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
      await this.operationAlerts.fail(organizationId, ORDER_SYNC_ALERT.operationKey, {
        message: `쿠팡 주문 동기화 실패: ${errorMessage(error)}`,
        href: ORDER_SYNC_ALERT.href,
        metadata: { error: errorMessage(error) },
      });
      throw error;
    }
  }

  @Post('inventory')
  async syncInventory(@CurrentOrganization() organizationId: string) {
    return this.syncService.syncInventory(organizationId);
  }
}
