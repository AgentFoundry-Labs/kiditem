import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { PurchaseOrdersService } from '../services/purchase-orders.service';
import { ListPurchaseOrdersQueryDto, PurchaseOrderActionBodyDto } from '../dto';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly purchaseOrdersService: PurchaseOrdersService,
  ) {}

  @Get()
  findAll(@Query() query: ListPurchaseOrdersQueryDto) {
    return this.purchaseOrdersService.findAll(query as any);
  }

  @Post()
  async handleAction(@Body() body: PurchaseOrderActionBodyDto) {
    if (body.action === 'create') {
      return this.purchaseOrdersService.create(body as any);
    }
    if (body.action === 'updateStatus') {
      return this.purchaseOrdersService.updateStatus(body.id!, body.status!);
    }
    if (body.action === 'delete') {
      return this.purchaseOrdersService.delete(body.id!);
    }
  }
}
