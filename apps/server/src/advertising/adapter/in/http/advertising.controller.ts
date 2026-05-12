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
import { AdvertisingService } from '../../../application/service/advertising.service';
import { AdCampaignsService } from '../../../application/service/ad-campaigns.service';
import { AdStrategyService } from '../../../application/service/ad-strategy.service';
import { AdBenchmarkService } from '../../../application/service/ad-benchmark.service';
import { AdCollectService } from '../../../application/service/ad-collect.service';
import { AdSyncService } from '../../../application/service/ad-sync.service';
import { AdActionService } from '../../../application/service/ad-action.service';
import { AdExecutionService } from '../../../application/service/ad-execution.service';
import { AdConfigService } from '../../../application/service/ad-config.service';
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
} from './dto';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';

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
  getConfig(@CurrentOrganization() organizationId: string) {
    return this.adConfigService.getConfig(organizationId);
  }

  @Patch('config/:key')
  updateConfig(
    @Param('key') key: string,
    @Body() body: UpdateAdConfigDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.adConfigService.updateConfig(`ads.${key}`, body.value, organizationId);
  }

  // === 기존 엔드포인트 ===

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

  // === 캠페인 ===

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

  // === 전략 ===

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

  // === 벤치마크 ===

  @Get('benchmark')
  getBenchmark(@CurrentOrganization() organizationId: string) {
    return this.adBenchmarkService.getDiagnosis(organizationId);
  }

  // === 수집 ===

  @Post('collect')
  startCollection(@Body() body: CollectAdsDto, @CurrentOrganization() organizationId: string) {
    return this.adCollectService.startCollection(body.period, organizationId);
  }

  @Get('collect/status')
  getCollectStatus(@CurrentOrganization() organizationId: string) {
    return this.adCollectService.getStatus(organizationId);
  }

  // === 익스텐션 연동 ===

  @Post('extension/sync')
  extensionSync(@Body() body: ExtensionSyncDto, @CurrentOrganization() organizationId: string) {
    return this.adSyncService.sync(body, organizationId);
  }

  @Get('extension/status')
  extensionStatus(@CurrentOrganization() organizationId: string) {
    return this.adSyncService.getExtensionStatus(organizationId);
  }

  // === 스크래핑 대상 관리 ===

  @Get('scrape-targets')
  getScrapeTargets(@CurrentOrganization() organizationId: string) {
    return this.adSyncService.getScrapeTargets(organizationId);
  }

  @Post('scrape-targets')
  handleScrapeTarget(
    @Body() body: MarkScrapedDto | CreateScrapeTargetDto,
    @CurrentOrganization() organizationId: string,
  ) {
    // 익스텐션에서 markScraped 호출 시
    if ('action' in body && (body as MarkScrapedDto).action === 'markScraped') {
      return this.adSyncService.markScraped((body as MarkScrapedDto).id, organizationId);
    }
    // 새 scrape target 생성
    const createBody = body as CreateScrapeTargetDto;
    return this.adSyncService.createScrapeTarget(
      createBody.url,
      createBody.label,
      createBody.category,
      organizationId,
    );
  }

  @Delete('scrape-targets/:id')
  deleteScrapeTarget(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.adSyncService.deleteScrapeTarget(id, organizationId);
  }

  // === 액션 (AdAction) ===

  @Get('actions')
  getActions(@Query() query: AdActionQueryDto, @CurrentOrganization() organizationId: string) {
    return this.adActionService.getActions(query, organizationId);
  }

  @Post('actions')
  handleActionCommand(
    @Body() body: AdActionCommandDto,
    @CurrentOrganization() organizationId: string,
  ) {
    switch (body.action) {
      case 'generate':
        return this.adActionService.generateActions(organizationId);
      case 'approve':
        return this.adActionService.approveActions(body.ids ?? [], organizationId);
      case 'reject':
        return this.adActionService.rejectActions(body.ids ?? [], organizationId);
      case 'markRunning':
        if (!body.id) throw new BadRequestException('id is required for markRunning');
        return this.adActionService.markRunning(body.id, body.beforeJson, organizationId);
      case 'markDone':
        if (!body.id) throw new BadRequestException('id is required for markDone');
        return this.adActionService.markDone(body.id, body.afterJson, organizationId);
      case 'markFailed':
        if (!body.id) throw new BadRequestException('id is required for markFailed');
        return this.adActionService.markFailed(
          body.id,
          body.errorMessage,
          body.afterJson,
          organizationId,
        );
      case 'resetFailed':
        return this.adActionService.resetFailed(organizationId);
      default:
        throw new BadRequestException(`Unknown action: ${body.action}`);
    }
  }

  // === 실행 (Execution) ===

  @Post('execution/lease')
  executionLease(@Body() body: LeaseDto, @CurrentOrganization() organizationId: string) {
    return this.adExecutionService.lease(
      body.workerKey,
      {
        label: body.label,
        pageType: body.pageType,
        limit: body.limit,
      },
      organizationId,
    );
  }

  @Post('execution/heartbeat')
  executionHeartbeat(@Body() body: HeartbeatDto, @CurrentOrganization() organizationId: string) {
    return this.adExecutionService.heartbeat(
      body.workerKey,
      {
        currentUrl: body.currentUrl,
        currentPageType: body.currentPageType,
      },
      organizationId,
    );
  }

  @Post('execution/report')
  executionReport(@Body() body: ReportDto, @CurrentOrganization() organizationId: string) {
    return this.adExecutionService.report(body, organizationId);
  }

  // === 기존 리스트 (맨 아래 — catch-all) ===

  @Get()
  findAll(@Query() query: ListAdsQueryDto, @CurrentOrganization() organizationId: string) {
    return this.advertisingService.findAll(query, organizationId);
  }
}
