import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { StatisticsService } from '../../../../application/service/statistics/statistics.service';
import { StatisticsQueryDto } from './dto';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';

@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get()
  async getStatistics(
    @CurrentOrganization() organizationId: string,
    @Query() query: StatisticsQueryDto,
  ) {
    const { type, period } = query;
    // The request's instant decides which KST days of the window are closed.
    const now = new Date();

    switch (type) {
      case 'overview':
        return this.statisticsService.overview(organizationId, period, now);
      case 'products':
        return this.statisticsService.products(organizationId, period, now);
      case 'categories':
        return this.statisticsService.categories(organizationId, period, now);
      case 'grades':
        return this.statisticsService.grades(organizationId, period, now);
      case 'pareto':
        return this.statisticsService.pareto(organizationId, period, now);
      case 'repurchase':
        return this.statisticsService.repurchase(organizationId, period, now);
      default:
        throw new BadRequestException(`알 수 없는 통계 유형: ${type}`);
    }
  }
}
