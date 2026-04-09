import { Controller, Get, Post, Query, Body, BadRequestException } from '@nestjs/common';
import { ProcurementService } from './procurement.service';
import { ListPurchaseOrdersQueryDto, PurchaseOrderActionBodyDto } from './dto';

@Controller('purchase-orders')
export class ProcurementController {
  constructor(
    private readonly procurementService: ProcurementService,
  ) {}

  @Get()
  findAll(@Query() query: ListPurchaseOrdersQueryDto) {
    return this.procurementService.findAll(query as any);
  }

  @Post()
  async handleAction(@Body() body: PurchaseOrderActionBodyDto) {
    if (body.action === 'create') {
      return this.procurementService.create(body as any);
    }
    if (body.action === 'updateStatus') {
      return this.procurementService.updateStatus(body.id!, body.status!);
    }
    if (body.action === 'delete') {
      return this.procurementService.delete(body.id!);
    }
    throw new BadRequestException(`Unknown action: ${body.action}`);
  }
}
