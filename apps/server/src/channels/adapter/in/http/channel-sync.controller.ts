import { Controller, Get, Post, Body } from '@nestjs/common';
import { ChannelSyncService } from '../../../application/service/channel-sync.service';
import { SyncOrdersBodyDto } from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';

@Controller('coupang-sync')
export class ChannelSyncController {
  constructor(private readonly syncService: ChannelSyncService) {}

  @Get('health')
  async checkHealth(@CurrentOrganization() organizationId: string) {
    return this.syncService.checkHealth(organizationId);
  }

  @Post('products')
  async syncProducts(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.syncService.syncProductsWithAlert(organizationId, user.id);
  }

  @Post('orders')
  async syncOrders(
    @Body() body: SyncOrdersBodyDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const from = body.from ? new Date(body.from) : undefined;
    const to = body.to ? new Date(body.to) : undefined;
    return this.syncService.syncOrdersWithAlert(organizationId, user.id, from, to);
  }

  @Post('inventory')
  async syncInventory(@CurrentOrganization() organizationId: string) {
    return this.syncService.syncInventory(organizationId);
  }
}
