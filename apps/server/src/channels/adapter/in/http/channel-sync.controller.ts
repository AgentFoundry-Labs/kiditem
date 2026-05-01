import { Controller, Get, Post, Body } from '@nestjs/common';
import { ChannelSyncService } from '../../../application/service/channel-sync.service';
import { SyncOrdersBodyDto } from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';

@Controller('coupang-sync')
export class ChannelSyncController {
  constructor(private readonly syncService: ChannelSyncService) {}

  @Get('health')
  async checkHealth() {
    return this.syncService.checkHealth();
  }

  @Post('products')
  async syncProducts(@CurrentOrganization() organizationId: string) {
    return this.syncService.syncProducts(organizationId);
  }

  @Post('orders')
  async syncOrders(
    @Body() body: SyncOrdersBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    const from = body.from ? new Date(body.from) : undefined;
    const to = body.to ? new Date(body.to) : undefined;
    return this.syncService.syncOrders(organizationId, from, to);
  }

  @Post('inventory')
  async syncInventory(@CurrentOrganization() organizationId: string) {
    return this.syncService.syncInventory(organizationId);
  }
}
