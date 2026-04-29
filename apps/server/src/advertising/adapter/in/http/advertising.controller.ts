import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { AdvertisingService } from '../../../services/advertising.service';
import { AdCampaignsService } from '../../../services/ad-campaigns.service';
import { AdStrategyService } from '../../../services/ad-strategy.service';
import { AdBenchmarkService } from '../../../services/ad-benchmark.service';
import { AdCollectService } from '../../../services/ad-collect.service';
import { AdSyncService } from '../../../services/ad-sync.service';
import { AdActionService } from '../../../services/ad-action.service';
import { AdExecutionService } from '../../../services/ad-execution.service';
import { AdConfigService } from '../../../services/ad-config.service';
import {
  ListAdsQueryDto,
  ChangeAdTierBodyDto,
  CampaignQueryDto,
  TrendsQueryDto,
  StrategyQueryDto,
  CollectAdsDto,
  ExtensionSyncDto,
  CreateScrapeTargetDto,
  MarkScrapedDto,
  AdActionQueryDto,
  AdActionCommandDto,
  LeaseDto,
  HeartbeatDto,
  ReportDto,
  UpdateAdConfigDto,
  RegisterCampaignDto,
} from '../../../dto';
import { CurrentCompany } from '../../../../auth/decorators/current-company.decorator';

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
  getConfig(@CurrentCompany() companyId: string) {
    return this.adConfigService.getConfig(companyId);
  }

  @Patch('config/:key')
  updateConfig(
    @Param('key') key: string,
    @Body() body: UpdateAdConfigDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.adConfigService.updateConfig(`ads.${key}`, body.value, companyId);
  }

  // === 기존 엔드포인트 ===

  @Get('hub')
  getHub(@CurrentCompany() companyId: string) {
    return this.advertisingService.getHubData(companyId);
  }

  @Patch(':id/tier')
  changeTier(
    @Param('id') id: string,
    @Body() body: ChangeAdTierBodyDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.advertisingService.changeTier(id, body.adTier, companyId);
  }

  // === 캠페인 ===

  @Get('campaigns/trends')
  getTrends(@Query() query: TrendsQueryDto, @CurrentCompany() companyId: string) {
    return this.adCampaignsService.getTrends(query.period ?? '14d', query.days, companyId);
  }

  @Post('campaigns/register')
  registerCampaign(
    @Body() body: RegisterCampaignDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.adStrategyService.registerCampaign(body, companyId);
  }

  @Get('campaigns')
  getCampaigns(@Query() query: CampaignQueryDto, @CurrentCompany() companyId: string) {
    const period = (query.period ?? '7d') as '7d' | '14d' | 'month';
    return this.adCampaignsService.getCampaigns(period, query.campaign, companyId);
  }

  // === 전략 ===

  @Get('strategy/rules')
  getRules(@Query() query: StrategyQueryDto, @CurrentCompany() companyId: string) {
    return this.adStrategyService.getRules(query.period ?? '14d', companyId);
  }

  @Get('strategy/plan')
  getWeeklyPlan(@Query() query: StrategyQueryDto, @CurrentCompany() companyId: string) {
    return this.adStrategyService.getWeeklyPlan(query.period ?? '14d', companyId);
  }

  @Post('strategy/ai-plan')
  getAiPlan(@Query() query: StrategyQueryDto, @CurrentCompany() companyId: string) {
    return this.adStrategyService.getAiEnhancedPlan(query.period ?? '14d', companyId);
  }

  @Get('strategy/recommend')
  getRecommendations(@CurrentCompany() companyId: string) {
    return this.adStrategyService.getRecommendations(companyId);
  }

  @Get('exposure-analysis')
  getExposureAnalysis(@CurrentCompany() companyId: string) {
    return this.adStrategyService.getExposureAnalysis(companyId);
  }

  // === 벤치마크 ===

  @Get('benchmark')
  getBenchmark(@CurrentCompany() companyId: string) {
    return this.adBenchmarkService.getDiagnosis(companyId);
  }

  // === 수집 ===

  @Post('collect')
  startCollection(@Body() body: CollectAdsDto, @CurrentCompany() companyId: string) {
    return this.adCollectService.startCollection(body.period, companyId);
  }

  @Get('collect/status')
  getCollectStatus(@CurrentCompany() companyId: string) {
    return this.adCollectService.getStatus(companyId);
  }

  // === 익스텐션 연동 ===

  @Post('extension/sync')
  extensionSync(@Body() body: ExtensionSyncDto, @CurrentCompany() companyId: string) {
    return this.adSyncService.sync(body, companyId);
  }

  @Get('extension/status')
  extensionStatus(@CurrentCompany() companyId: string) {
    return this.adSyncService.getExtensionStatus(companyId);
  }

  // === 스크래핑 대상 관리 ===

  @Get('scrape-targets')
  getScrapeTargets(@CurrentCompany() companyId: string) {
    return this.adSyncService.getScrapeTargets(companyId);
  }

  @Post('scrape-targets')
  handleScrapeTarget(
    @Body() body: MarkScrapedDto | CreateScrapeTargetDto,
    @CurrentCompany() companyId: string,
  ) {
    // 익스텐션에서 markScraped 호출 시
    if ('action' in body && (body as MarkScrapedDto).action === 'markScraped') {
      return this.adSyncService.markScraped((body as MarkScrapedDto).id, companyId);
    }
    // 새 scrape target 생성
    const createBody = body as CreateScrapeTargetDto;
    return this.adSyncService.createScrapeTarget(
      createBody.url,
      createBody.label,
      createBody.category,
      companyId,
    );
  }

  @Delete('scrape-targets/:id')
  deleteScrapeTarget(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.adSyncService.deleteScrapeTarget(id, companyId);
  }

  // === 액션 (AdAction) ===

  @Get('actions')
  getActions(@Query() query: AdActionQueryDto, @CurrentCompany() companyId: string) {
    return this.adActionService.getActions(query, companyId);
  }

  @Post('actions')
  handleActionCommand(
    @Body() body: AdActionCommandDto,
    @CurrentCompany() companyId: string,
  ) {
    switch (body.action) {
      case 'generate':
        return this.adActionService.generateActions(companyId);
      case 'approve':
        return this.adActionService.approveActions(body.ids ?? [], companyId);
      case 'reject':
        return this.adActionService.rejectActions(body.ids ?? [], companyId);
      case 'markRunning':
        if (!body.id) throw new BadRequestException('id is required for markRunning');
        return this.adActionService.markRunning(body.id, body.beforeJson, companyId);
      case 'markDone':
        if (!body.id) throw new BadRequestException('id is required for markDone');
        return this.adActionService.markDone(body.id, body.afterJson, companyId);
      case 'markFailed':
        if (!body.id) throw new BadRequestException('id is required for markFailed');
        return this.adActionService.markFailed(
          body.id,
          body.errorMessage,
          body.afterJson,
          companyId,
        );
      case 'resetFailed':
        return this.adActionService.resetFailed(companyId);
      default:
        throw new BadRequestException(`Unknown action: ${body.action}`);
    }
  }

  // === 실행 (Execution) ===

  @Post('execution/lease')
  executionLease(@Body() body: LeaseDto, @CurrentCompany() companyId: string) {
    return this.adExecutionService.lease(
      body.workerKey,
      {
        label: body.label,
        pageType: body.pageType,
        limit: body.limit,
      },
      companyId,
    );
  }

  @Post('execution/heartbeat')
  executionHeartbeat(@Body() body: HeartbeatDto, @CurrentCompany() companyId: string) {
    return this.adExecutionService.heartbeat(
      body.workerKey,
      {
        currentUrl: body.currentUrl,
        currentPageType: body.currentPageType,
      },
      companyId,
    );
  }

  @Post('execution/report')
  executionReport(@Body() body: ReportDto, @CurrentCompany() companyId: string) {
    return this.adExecutionService.report(body, companyId);
  }

  // === 기존 리스트 (맨 아래 — catch-all) ===

  @Get()
  findAll(@Query() query: ListAdsQueryDto, @CurrentCompany() companyId: string) {
    return this.advertisingService.findAll(query, companyId);
  }
}
