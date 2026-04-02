import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { AdvertisingService } from './advertising.service';
import { AdCampaignsService } from './ad-campaigns.service';
import { AdStrategyService } from './ad-strategy.service';
import { AdBenchmarkService } from './ad-benchmark.service';
import { AdCollectService } from './ad-collect.service';
import { ListAdsQueryDto, ChangeAdTierBodyDto, CampaignQueryDto, TrendsQueryDto, CollectAdsDto } from './dto';

@Controller('ads')
export class AdvertisingController {
  constructor(
    private readonly advertisingService: AdvertisingService,
    private readonly adCampaignsService: AdCampaignsService,
    private readonly adStrategyService: AdStrategyService,
    private readonly adBenchmarkService: AdBenchmarkService,
    private readonly adCollectService: AdCollectService,
  ) {}

  // === 기존 엔드포인트 ===

  @Get('hub')
  getHub() {
    return this.advertisingService.getHubData();
  }

  @Patch(':id/tier')
  changeTier(
    @Param('id') id: string,
    @Body() body: ChangeAdTierBodyDto,
  ) {
    return this.advertisingService.changeTier(id, body.adTier);
  }

  // === 캠페인 ===

  @Get('campaigns/trends')
  getTrends(@Query() query: TrendsQueryDto) {
    return this.adCampaignsService.getTrends(query.days);
  }

  @Get('campaigns')
  getCampaigns(@Query() query: CampaignQueryDto) {
    return this.adCampaignsService.getCampaigns(query.period, query.campaign);
  }

  // === 전략 ===

  @Get('strategy/rules')
  getRules() {
    return this.adStrategyService.getRules();
  }

  @Get('strategy/plan')
  getWeeklyPlan() {
    return this.adStrategyService.getWeeklyPlan();
  }

  @Get('strategy/recommend')
  getRecommendations() {
    return this.adStrategyService.getRecommendations();
  }

  // === 벤치마크 ===

  @Get('benchmark')
  getBenchmark() {
    return this.adBenchmarkService.getDiagnosis();
  }

  // === 수집 ===

  @Post('collect')
  startCollection(@Body() body: CollectAdsDto) {
    return this.adCollectService.startCollection(body.period);
  }

  @Get('collect/status')
  getCollectStatus() {
    return this.adCollectService.getStatus();
  }

  // === 기존 리스트 (맨 아래 — catch-all) ===

  @Get()
  findAll(@Query() query: ListAdsQueryDto) {
    return this.advertisingService.findAll(query as any);
  }
}
