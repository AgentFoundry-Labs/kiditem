import { Controller, Get, Post, Body } from '@nestjs/common';
import { ChannelSyncService } from '../services/channel-sync.service';
import { SyncOrdersBodyDto } from '../dto';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';

@Controller('coupang-sync')
export class ChannelSyncController {
  constructor(private readonly syncService: ChannelSyncService) {}

  @Get('health')
  async checkHealth() {
    return this.syncService.checkHealth();
  }

  @Post('products')
  async syncProducts(@CurrentCompany() companyId: string) {
    return this.syncService.syncProducts(companyId);
  }

  @Post('orders')
  async syncOrders(
    @Body() body: SyncOrdersBodyDto,
    @CurrentCompany() companyId: string,
  ) {
    const from = body.from ? new Date(body.from) : undefined;
    const to = body.to ? new Date(body.to) : undefined;
    return this.syncService.syncOrders(companyId, from, to);
  }

  @Post('inventory')
  async syncInventory(@CurrentCompany() companyId: string) {
    return this.syncService.syncInventory(companyId);
  }
}
