import { Controller, Get, Post, Query, Body, BadRequestException } from '@nestjs/common';
import { ProcurementService } from '../../../application/service/procurement.service';
import { ListPurchaseOrdersQueryDto, PurchaseOrderActionBodyDto } from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';

@Controller('purchase-orders')
export class ProcurementController {
  constructor(
    private readonly procurementService: ProcurementService,
  ) {}

  @Get()
  findAll(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListPurchaseOrdersQueryDto,
  ) {
    return this.procurementService.findAll(organizationId, query);
  }

  @Post()
  async handleAction(
    @CurrentOrganization() organizationId: string,
    @Body() body: PurchaseOrderActionBodyDto,
  ) {
    if (body.action === 'create') {
      return this.procurementService.create(organizationId, {
        supplierName: body.supplierName!,
        supplierId: body.supplierId,
        items: body.items!,
        expectedDeliveryDate: body.expectedDeliveryDate,
      });
    }
    if (body.action === 'updateStatus') {
      return this.procurementService.updateStatus(organizationId, body.id!, body.status!);
    }
    if (body.action === 'delete') {
      return this.procurementService.delete(organizationId, body.id!);
    }
    throw new BadRequestException(`Unknown action: ${body.action}`);
  }
}
