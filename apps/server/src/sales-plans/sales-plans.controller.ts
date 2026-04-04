import { Controller, Get, Post, Patch, Delete, Param, Query, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesPlansService } from './sales-plans.service';
import { ListSalesPlansQueryDto, CreateSalesPlanDto, UpdateSalesPlanDto } from './dto';

@Controller('sales-plans')
export class SalesPlansController {
  constructor(
    private readonly salesPlansService: SalesPlansService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new Error('No company found');
    return first.id;
  }

  @Get()
  async findAll(@Query() query: ListSalesPlansQueryDto) {
    return this.salesPlansService.findAll(
      await this.resolveCompanyId(query.companyId),
    );
  }

  @Post()
  create(@Body() dto: CreateSalesPlanDto) {
    return this.salesPlansService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSalesPlanDto) {
    return this.salesPlansService.update(id, dto);
  }

  @Patch(':id/sync')
  syncActuals(@Param('id') id: string) {
    return this.salesPlansService.syncActuals(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.salesPlansService.delete(id);
  }
}
