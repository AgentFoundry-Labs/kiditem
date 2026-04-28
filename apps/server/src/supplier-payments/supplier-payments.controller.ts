import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { SupplierPaymentsService } from './supplier-payments.service';
import { ListSupplierPaymentsQueryDto, CreateSupplierPaymentDto, UpdateSupplierPaymentDto } from './dto';
import { CurrentCompany } from '../auth/decorators/current-company.decorator';

@Controller('supplier-payments')
export class SupplierPaymentsController {
  constructor(private readonly supplierPaymentsService: SupplierPaymentsService) {}

  @Get()
  async findAll(
    @CurrentCompany() companyId: string,
    @Query() query: ListSupplierPaymentsQueryDto,
  ) {
    return this.supplierPaymentsService.findAll(companyId, query.status);
  }

  @Post()
  create(@Body() dto: CreateSupplierPaymentDto, @CurrentCompany() companyId: string) {
    return this.supplierPaymentsService.create(companyId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierPaymentDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.supplierPaymentsService.update(id, dto, companyId);
  }
}
