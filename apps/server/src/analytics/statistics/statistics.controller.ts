import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { StatisticsQueryDto } from './dto';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';

@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get()
  async getStatistics(
    @CurrentOrganization() organizationId: string,
    @Query() query: StatisticsQueryDto,
  ) {
    const { type, period } = query;

    switch (type) {
      case 'overview':
        return this.statisticsService.overview(organizationId, period);
      case 'products':
        return this.statisticsService.products(organizationId, period);
      case 'categories':
        return this.statisticsService.categories(organizationId, period);
      case 'delivery':
        return this.statisticsService.delivery(organizationId, period);
      case 'grades':
        return this.statisticsService.grades(organizationId, period);
      case 'pareto':
        return this.statisticsService.pareto(organizationId, period);
      case 'repurchase':
        return this.statisticsService.repurchase(organizationId, period);
      default:
        throw new BadRequestException(`알 수 없는 통계 유형: ${type}`);
    }
  }
}
