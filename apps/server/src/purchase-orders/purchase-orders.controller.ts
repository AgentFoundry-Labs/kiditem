import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly purchaseOrdersService: PurchaseOrdersService,
  ) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.purchaseOrdersService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
    });
  }

  @Post()
  async handleAction(@Body() body: Record<string, unknown>) {
    const { action, ...data } = body;
    switch (action) {
      case 'create':
        return this.purchaseOrdersService.create(
          data as Parameters<PurchaseOrdersService['create']>[0],
        );
      case 'updateStatus':
        return this.purchaseOrdersService.updateStatus(
          data.id as string,
          data.status as string,
        );
      case 'delete':
        return this.purchaseOrdersService.delete(data.id as string);
      default:
        throw new BadRequestException('Unknown action');
    }
  }
}
