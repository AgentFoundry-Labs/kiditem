import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { SupplierStatsService } from './supplier-stats.service';
import { SupplierStatsQueryDto } from './dto';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';

@Controller('supplier-stats')
export class SupplierStatsController {
  constructor(private readonly supplierStatsService: SupplierStatsService) {}

  @Get()
  async getStats(
    @CurrentCompany() companyId: string,
    @Query() query: SupplierStatsQueryDto,
  ) {
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
