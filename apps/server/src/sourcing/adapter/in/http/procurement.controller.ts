import { Controller, Get, Post, Query, Body, BadRequestException } from '@nestjs/common';
import { ProcurementService } from '../../../application/service/procurement.service';
import { ListPurchaseOrdersQueryDto, PurchaseOrderActionBodyDto } from './dto';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';

@Controller('purchase-orders')
export class ProcurementController {
  constructor(
    private readonly procurementService: ProcurementService,
  ) {}

  @Get()
  findAll(
    @CurrentCompany() companyId: string,
    @Query() query: ListPurchaseOrdersQueryDto,
  ) {
    return this.procurementService.findAll(companyId, query);
  }

  @Post()
  async handleAction(
    @CurrentCompany() companyId: string,
    @Body() body: PurchaseOrderActionBodyDto,
  ) {
    if (body.action === 'create') {
      return this.procurementService.create(companyId, {
        supplierName: body.supplierName!,
        supplierId: body.supplierId,
        items: body.items!,
        expectedDeliveryDate: body.expectedDeliveryDate,
      });
    }
    if (body.action === 'updateStatus') {
      return this.procurementService.updateStatus(companyId, body.id!, body.status!);
    }
    if (body.action === 'delete') {
      return this.procurementService.delete(companyId, body.id!);
    }
    throw new BadRequestException(`Unknown action: ${body.action}`);
  }
}
