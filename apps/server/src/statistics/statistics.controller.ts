import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { CompanyResolverService } from '../common/company-resolver.service';
import { StatisticsService } from './statistics.service';
import { StatisticsQueryDto } from './dto';

@Controller('statistics')
export class StatisticsController {
  constructor(
    private readonly statisticsService: StatisticsService,
    private readonly companyResolver: CompanyResolverService,
  ) {}

  @Get()
  async getStatistics(@Query() query: StatisticsQueryDto) {
    const companyId = await this.companyResolver.resolve();
    const { type, period } = query;

    switch (type) {
      case 'overview':
        return this.statisticsService.overview(companyId, period);
      case 'products':
        return this.statisticsService.products(companyId, period);
      case 'categories':
        return this.statisticsService.categories(companyId, period);
      case 'delivery':
        return this.statisticsService.delivery(companyId, period);
      case 'grades':
        return this.statisticsService.grades(companyId, period);
      case 'pareto':
        return this.statisticsService.pareto(companyId, period);
      case 'repurchase':
        return this.statisticsService.repurchase(companyId, period);
      default:
        throw new BadRequestException(`알 수 없는 통계 유형: ${type}`);
    }
  }
}
