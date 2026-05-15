import { Controller, Get, Post, Query } from '@nestjs/common';
import { AdStrategyService } from '../../../application/service/ad-strategy.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { StrategyQueryDto } from './dto';

@Controller('ads')
export class AdvertisingStrategyController {
  constructor(private readonly adStrategyService: AdStrategyService) {}

  @Get('strategy/rules')
  getRules(@Query() query: StrategyQueryDto, @CurrentOrganization() organizationId: string) {
    return this.adStrategyService.getRules(query.period ?? '14d', organizationId);
  }

  @Get('strategy/plan')
  getWeeklyPlan(@Query() query: StrategyQueryDto, @CurrentOrganization() organizationId: string) {
    return this.adStrategyService.getWeeklyPlan(query.period ?? '14d', organizationId);
  }

  @Post('strategy/ai-plan')
  getAiPlan(@Query() query: StrategyQueryDto, @CurrentOrganization() organizationId: string) {
    return this.adStrategyService.getAiEnhancedPlan(query.period ?? '14d', organizationId);
  }

  @Get('strategy/recommend')
  getRecommendations(@CurrentOrganization() organizationId: string) {
    return this.adStrategyService.getRecommendations(organizationId);
  }

  @Get('exposure-analysis')
  getExposureAnalysis(@CurrentOrganization() organizationId: string) {
    return this.adStrategyService.getExposureAnalysis(organizationId);
  }
}
