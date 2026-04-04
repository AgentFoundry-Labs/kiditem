import { Controller, Get, Post, Patch, Delete, Param, Query, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SuppliersService } from './suppliers.service';
import { ListSuppliersQueryDto, CreateSupplierDto, UpdateSupplierDto } from './dto';

@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new Error('No company found');
    return first.id;
  }

  @Get()
  async findAll(@Query() query: ListSuppliersQueryDto) {
    return this.suppliersService.findAll(
      await this.resolveCompanyId(query.companyId),
    );
  }

  @Post()
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.suppliersService.delete(id);
  }
}
