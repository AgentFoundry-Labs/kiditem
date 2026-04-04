import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupplierPaymentsService } from './supplier-payments.service';
import { ListSupplierPaymentsQueryDto, CreateSupplierPaymentDto, UpdateSupplierPaymentDto } from './dto';

@Controller('supplier-payments')
export class SupplierPaymentsController {
  constructor(
    private readonly supplierPaymentsService: SupplierPaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new Error('No company found');
    return first.id;
  }

  @Get()
  async findAll(@Query() query: ListSupplierPaymentsQueryDto) {
    return this.supplierPaymentsService.findAll(
      await this.resolveCompanyId(query.companyId),
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
