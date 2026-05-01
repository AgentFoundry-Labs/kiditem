import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { SupplierPaymentsService } from './supplier-payments.service';
import { ListSupplierPaymentsQueryDto, CreateSupplierPaymentDto, UpdateSupplierPaymentDto } from './dto';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';

@Controller('supplier-payments')
export class SupplierPaymentsController {
  constructor(private readonly supplierPaymentsService: SupplierPaymentsService) {}

  @Get()
  async findAll(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListSupplierPaymentsQueryDto,
  ) {
    return this.supplierPaymentsService.findAll(organizationId, query.status);
  }

  @Post()
  create(@Body() dto: CreateSupplierPaymentDto, @CurrentOrganization() organizationId: string) {
    return this.supplierPaymentsService.create(organizationId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierPaymentDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.supplierPaymentsService.update(id, organizationId, dto);
  }
}
