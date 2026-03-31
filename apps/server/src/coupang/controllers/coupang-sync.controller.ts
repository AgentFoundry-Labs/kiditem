import { Controller, Get, Post, Body } from '@nestjs/common';
import { CoupangSyncService } from '../services/coupang-sync.service';
import { SyncOrdersBodyDto } from '../dto';

@Controller('coupang-sync')
export class CoupangSyncController {
  constructor(private readonly syncService: CoupangSyncService) {}

  @Get('health')
  async checkHealth() {
    return this.syncService.checkHealth();
  }

  @Post('products')
  async syncProducts() {
    return this.syncService.syncProducts();
  }

  @Post('orders')
  async syncOrders(@Body() body: SyncOrdersBodyDto) {
    const from = body.from ? new Date(body.from) : undefined;
    const to = body.to ? new Date(body.to) : undefined;
    return this.syncService.syncOrders(from, to);
  }

  @Post('inventory')
  async syncInventory() {
    return this.syncService.syncInventory();
  }
}
