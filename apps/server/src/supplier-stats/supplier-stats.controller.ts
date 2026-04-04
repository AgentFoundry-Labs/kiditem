import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupplierStatsService } from './supplier-stats.service';
import { SupplierStatsQueryDto } from './dto';

@Controller('supplier-stats')
export class SupplierStatsController {
  constructor(
    private readonly supplierStatsService: SupplierStatsService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId;
    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (!first) throw new Error('No company found');
    return first.id;
  }

  @Get()
  async getStats(@Query() query: SupplierStatsQueryDto) {
    const companyId = await this.resolveCompanyId(query.companyId);

    switch (query.type) {
      case 'sales':
        return this.supplierStatsService.getSalesBySupplier(companyId);
      case 'productSales':
        if (!query.supplierId) {
          throw new BadRequestException('supplierId는 productSales 타입에 필수입니다');
        }
        return this.supplierStatsService.getProductSales(companyId, query.supplierId);
      case 'history':
        if (!query.supplierId) {
          throw new BadRequestException('supplierId는 history 타입에 필수입니다');
        }
        return this.supplierStatsService.getHistory(companyId, query.supplierId);
      default:
        throw new BadRequestException(`지원하지 않는 type: ${query.type}`);
    }
  }
}
