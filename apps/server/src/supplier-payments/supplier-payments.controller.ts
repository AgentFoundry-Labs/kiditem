import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { CompanyResolverService } from '../common/company-resolver.service';
import { SupplierPaymentsService } from './supplier-payments.service';
import { ListSupplierPaymentsQueryDto, CreateSupplierPaymentDto, UpdateSupplierPaymentDto } from './dto';

@Controller('supplier-payments')
export class SupplierPaymentsController {
  constructor(
    private readonly supplierPaymentsService: SupplierPaymentsService,
    private readonly companyResolver: CompanyResolverService,
  ) {}

  @Get()
  async findAll(@Query() query: ListSupplierPaymentsQueryDto) {
    return this.supplierPaymentsService.findAll(
      await this.companyResolver.resolve(),
      query.status,
    );
  }

  @Post()
  create(@Body() dto: CreateSupplierPaymentDto) {
    return this.supplierPaymentsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierPaymentDto) {
    return this.supplierPaymentsService.update(id, dto);
  }
}
