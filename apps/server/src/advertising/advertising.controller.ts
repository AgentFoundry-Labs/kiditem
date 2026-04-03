import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { AdvertisingService } from './advertising.service';
import { AdCampaignsService } from './ad-campaigns.service';
import { AdStrategyService } from './ad-strategy.service';
import { AdBenchmarkService } from './ad-benchmark.service';
import { AdCollectService } from './ad-collect.service';
import { AdSyncService } from './ad-sync.service';
import { AdActionService } from './ad-action.service';
import { AdExecutionService } from './ad-execution.service';
import { AdConfigService } from './ad-config.service';
import {
  ListAdsQueryDto, ChangeAdTierBodyDto, CampaignQueryDto, TrendsQueryDto,
  CollectAdsDto, ExtensionSyncDto, CreateScrapeTargetDto, MarkScrapedDto,
  AdActionQueryDto, AdActionCommandDto, LeaseDto, HeartbeatDto, ReportDto,
  UpdateAdConfigDto,
} from './dto';

@Controller('ads')
export class AdvertisingController {
  constructor(
    private readonly advertisingService: AdvertisingService,
    private readonly adCampaignsService: AdCampaignsService,
    private readonly adStrategyService: AdStrategyService,
    private readonly adBenchmarkService: AdBenchmarkService,
    private readonly adCollectService: AdCollectService,
    private readonly adSyncService: AdSyncService,
    private readonly adActionService: AdActionService,
    private readonly adExecutionService: AdExecutionService,
    private readonly adConfigService: AdConfigService,
  ) {}

  // === 설정 (config — catch-all 위에 배치) ===

  @Get('config')
  getConfig() {
    return this.adConfigService.getConfig();
  }

  @Patch('config/:key')
  updateConfig(
    @Param('key') key: string,
    @Body() body: UpdateAdConfigDto,
  ) {
    return this.adConfigService.updateConfig(undefined, `ads.${key}`, body.value);
  }

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

  // === 익스텐션 연동 ===

  @Post('extension/sync')
  extensionSync(@Body() body: ExtensionSyncDto) {
    return this.adSyncService.sync(body);
  }

  @Get('extension/status')
  extensionStatus() {
    return this.adSyncService.getExtensionStatus();
  }

  // === 스크래핑 대상 관리 ===

  @Get('scrape-targets')
  getScrapeTargets() {
    return this.adSyncService.getScrapeTargets();
  }

  @Post('scrape-targets')
  handleScrapeTarget(@Body() body: MarkScrapedDto | CreateScrapeTargetDto) {
    // 익스텐션에서 markScraped 호출 시
    if ('action' in body && (body as MarkScrapedDto).action === 'markScraped') {
      return this.adSyncService.markScraped((body as MarkScrapedDto).id);
    }
    // 새 scrape target 생성
    const createBody = body as CreateScrapeTargetDto;
    return this.adSyncService.createScrapeTarget(createBody.url, createBody.label, createBody.category);
  }

  @Delete('scrape-targets/:id')
  deleteScrapeTarget(@Param('id') id: string) {
    return this.adSyncService.deleteScrapeTarget(id);
  }

  // === 액션 (AdAction) ===

  @Get('actions')
  getActions(@Query() query: AdActionQueryDto) {
    return this.adActionService.getActions(query);
  }

  @Post('actions')
  handleActionCommand(@Body() body: AdActionCommandDto) {
    if (body.action === 'generate') return this.adActionService.generateActions();
    if (body.action === 'approve') return this.adActionService.approveActions(body.ids || []);
    if (body.action === 'reject') return this.adActionService.rejectActions(body.ids || []);
    if (body.action === 'markRunning') return this.adActionService.markRunning(body.id!, body.beforeJson);
    if (body.action === 'markDone') return this.adActionService.markDone(body.id!, body.afterJson);
    if (body.action === 'markFailed') return this.adActionService.markFailed(body.id!, body.errorMessage, body.afterJson);
    if (body.action === 'resetFailed') return this.adActionService.resetFailed();
  }

  // === 실행 (Execution) ===

  @Post('execution/lease')
  executionLease(@Body() body: LeaseDto) {
    return this.adExecutionService.lease(body.workerKey, {
      label: body.label,
      pageType: body.pageType,
      limit: body.limit,
    });
  }

  @Post('execution/heartbeat')
  executionHeartbeat(@Body() body: HeartbeatDto) {
    return this.adExecutionService.heartbeat(body.workerKey, {
      currentUrl: body.currentUrl,
      currentPageType: body.currentPageType,
    });
  }

  @Post('execution/report')
  executionReport(@Body() body: ReportDto) {
    return this.adExecutionService.report(body);
  }

  // === 기존 리스트 (맨 아래 — catch-all) ===

  @Get()
  findAll(@Query() query: ListAdsQueryDto) {
    return this.advertisingService.findAll(query as any);
  }
}
