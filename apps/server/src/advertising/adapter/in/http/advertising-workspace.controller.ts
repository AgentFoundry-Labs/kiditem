import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AdvertisingService } from '../../../application/service/advertising.service';
import { AdCampaignsService } from '../../../application/service/ad-campaigns.service';
import { AdStrategyService } from '../../../application/service/ad-strategy.service';
import { AdBenchmarkService } from '../../../application/service/ad-benchmark.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import {
  CampaignQueryDto,
  ChangeAdTierBodyDto,
  ListAdsQueryDto,
  RegisterCampaignDto,
  StrategyQueryDto,
  TrendsQueryDto,
} from './dto';

@Controller('ads')
export class AdvertisingWorkspaceController {
  constructor(
    private readonly advertisingService: AdvertisingService,
    private readonly adCampaignsService: AdCampaignsService,
    private readonly adStrategyService: AdStrategyService,
    private readonly adBenchmarkService: AdBenchmarkService,
  ) {}

  @Get('hub')
  getHub(@CurrentOrganization() organizationId: string) {
    return this.advertisingService.getHubData(organizationId);
  }

  @Patch(':id/tier')
  changeTier(
    @Param('id') id: string,
    @Body() body: ChangeAdTierBodyDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.advertisingService.changeTier(id, body.adTier, organizationId);
  }

  @Get('products')
  getProducts(@Query() query: StrategyQueryDto, @CurrentOrganization() organizationId: string) {
    return this.adCampaignsService.getProducts(query.period ?? '14d', organizationId);
  }

  @Get('campaigns/trends')
  getTrends(@Query() query: TrendsQueryDto, @CurrentOrganization() organizationId: string) {
    return this.adCampaignsService.getTrends(query.period ?? '14d', query.days, organizationId);
  }

  @Post('campaigns/register')
  registerCampaign(
    @Body() body: RegisterCampaignDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.adStrategyService.registerCampaign(body, organizationId);
  }

  @Get('campaigns')
  getCampaigns(@Query() query: CampaignQueryDto, @CurrentOrganization() organizationId: string) {
    const period = (query.period ?? '7d') as '7d' | '14d' | 'month';
    return this.adCampaignsService.getCampaigns(period, query.campaign, organizationId);
  }

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

  @Get('benchmark')
  getBenchmark(@CurrentOrganization() organizationId: string) {
    return this.adBenchmarkService.getDiagnosis(organizationId);
  }

  @Get()
  findAll(@Query() query: ListAdsQueryDto, @CurrentOrganization() organizationId: string) {
    return this.advertisingService.findAll(query, organizationId);
  }
}
