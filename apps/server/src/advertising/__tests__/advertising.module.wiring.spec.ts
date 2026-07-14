import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { AdvertisingModule } from '../advertising.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AgentOsModule } from '../../agent-os/agent-os.module';
import { AutomationModule } from '../../automation/automation.module';

import { AdvertisingActionsController } from '../adapter/in/http/advertising-actions.controller';
import { AdvertisingCampaignsController } from '../adapter/in/http/advertising-campaigns.controller';
import { AdvertisingConfigController } from '../adapter/in/http/advertising-config.controller';
import { AdvertisingDiagnosticsController } from '../adapter/in/http/advertising-diagnostics.controller';
import { AdvertisingExecutionController } from '../adapter/in/http/advertising-execution.controller';
import { AdvertisingIngestController } from '../adapter/in/http/advertising-ingest.controller';
import { AdvertisingOverviewController } from '../adapter/in/http/advertising-overview.controller';
import { AdvertisingStrategyController } from '../adapter/in/http/advertising-strategy.controller';
import { AdStrategyAgentController } from '../adapter/in/http/ad-strategy-agent.controller';
import { KeywordRankController } from '../adapter/in/http/keyword-rank.controller';
import { CompetitorTrackingController } from '../adapter/in/http/competitor-tracking.controller';
import { WingTrackedProductController } from '../adapter/in/http/wing-tracked-product.controller';

// adapter/out/repository
import { ScrapeTargetRepositoryAdapter } from '../adapter/out/repository/scrape-target.repository.adapter';
import { AdConfigRepositoryAdapter } from '../adapter/out/repository/ad-config.repository.adapter';
import { AdBenchmarkRepositoryAdapter } from '../adapter/out/repository/ad-benchmark.repository.adapter';
import { AdAccountKpiRepositoryAdapter } from '../adapter/out/repository/ad-account-kpi.repository.adapter';
import { AdListingRepositoryAdapter } from '../adapter/out/repository/ad-listing.repository.adapter';
import { AdCampaignRepositoryAdapter } from '../adapter/out/repository/ad-campaign.repository.adapter';
import { AdActionRepositoryAdapter } from '../adapter/out/repository/ad-action.repository.adapter';
import { AdExecutionRepositoryAdapter } from '../adapter/out/repository/ad-execution.repository.adapter';
import { AdStrategyContextRepositoryAdapter } from '../adapter/out/repository/ad-strategy-context.repository.adapter';
import { ChannelScrapeRepositoryAdapter } from '../adapter/out/repository/channel-scrape.repository.adapter';
import { ChannelListingDailyRepositoryAdapter } from '../adapter/out/repository/channel-listing-daily.repository.adapter';
import { ChannelOptionDailyRepositoryAdapter } from '../adapter/out/repository/channel-option-daily.repository.adapter';
import { ChannelTargetDailyRepositoryAdapter } from '../adapter/out/repository/channel-target-daily.repository.adapter';
import { KeywordRankRepositoryAdapter } from '../adapter/out/repository/keyword-rank.repository.adapter';
import { KiditemStorefrontAdapter } from '../adapter/out/provider/kiditem-storefront.adapter';
// adapter/out/automation
import { OperationAlertAdapter } from '../adapter/out/automation/operation-alert.adapter';

// application/service + handlers
import { AdvertisingService } from '../application/service/advertising.service';
import { AdCampaignsService } from '../application/service/ad-campaigns.service';
import { AdStrategyService } from '../application/service/ad-strategy.service';
import { AdStrategyAgentService } from '../application/service/ad-strategy-agent.service';
import { AdGradeRulesService } from '../application/service/ad-grade-rules.service';
import { AdBudgetAllocatorService } from '../application/service/ad-budget-allocator.service';
import { AdExposureService } from '../application/service/ad-exposure.service';
import { AdRecommendService } from '../application/service/ad-recommend.service';
import { AdBenchmarkService } from '../application/service/ad-benchmark.service';
import { AdCollectService } from '../application/service/ad-collect.service';
import { AdSyncService } from '../application/service/ad-sync.service';
import { AdActionService } from '../application/service/ad-action.service';
import { AdExecutionService } from '../application/service/ad-execution.service';
import { AdConfigService } from '../application/service/ad-config.service';
import { KeywordRankService } from '../application/service/keyword-rank.service';
import { CompetitorTrackingService } from '../application/service/competitor-tracking.service';
import { AdCampaignIngestHandler } from '../application/service/ad-campaign-ingest.handler';
import { CoupangAdsDailyIngestHandler } from '../application/service/coupang-ads-daily-ingest.handler';
import { KeywordRankIngestHandler } from '../application/service/keyword-rank-ingest.handler';
import { WingSalesRankIngestHandler } from '../application/service/wing-sales-rank-ingest.handler';
import { RawScrapeIngestHandler } from '../application/service/raw-scrape-ingest.handler';
import { TrafficIngestHandler } from '../application/service/traffic-ingest.handler';

// transitional facade — grandfathered by AGENTS.md
import { ChannelScrapePersistenceService } from '../services/channel-scrape-persistence.service';

// NestJS @Module / @Controller metadata keys (stable across Nest 10/11).
const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';
const PATH_KEY = 'path';

const ADS_CONTROLLERS = [
  AdvertisingActionsController,
  AdvertisingCampaignsController,
  AdvertisingConfigController,
  AdvertisingDiagnosticsController,
  AdvertisingExecutionController,
  AdvertisingIngestController,
  AdvertisingOverviewController,
  AdvertisingStrategyController,
];

// Architecture-guard companion to advertising.architecture.spec.ts and the
// dev:server boot check in the advertising AGENTS.md verification gate. This
// spec freezes only the @Module()/@Controller() metadata so a missing
// provider, a stray legacy controller, or an accidental route rename fails
// at vitest time before reaching dev:server boot.
describe('AdvertisingModule capability wiring', () => {
  it('imports exactly Prisma, AgentOs, and Automation', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, AdvertisingModule) ?? [];
    expect(imports).toHaveLength(3);
    expect(new Set(imports)).toEqual(
      new Set([PrismaModule, AgentOsModule, AutomationModule]),
    );
  });

  it('mounts route-family ads + ad-agent controllers from adapter/in/http', () => {
    const controllers: unknown[] =
      Reflect.getMetadata(CONTROLLERS_KEY, AdvertisingModule) ?? [];
    expect(new Set(controllers)).toEqual(
      new Set([
        ...ADS_CONTROLLERS,
        AdStrategyAgentController,
        KeywordRankController,
        CompetitorTrackingController,
        WingTrackedProductController,
      ]),
    );
  });

  it('declares every repository + automation adapter as a provider', () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AdvertisingModule) ?? [];
    for (const cls of [
      ScrapeTargetRepositoryAdapter,
      AdConfigRepositoryAdapter,
      AdBenchmarkRepositoryAdapter,
      AdAccountKpiRepositoryAdapter,
      AdListingRepositoryAdapter,
      AdCampaignRepositoryAdapter,
      AdActionRepositoryAdapter,
      AdExecutionRepositoryAdapter,
      AdStrategyContextRepositoryAdapter,
      ChannelScrapeRepositoryAdapter,
      ChannelListingDailyRepositoryAdapter,
      ChannelOptionDailyRepositoryAdapter,
      ChannelTargetDailyRepositoryAdapter,
      KeywordRankRepositoryAdapter,
      KiditemStorefrontAdapter,
      OperationAlertAdapter,
    ]) {
      expect(providers).toContain(cls);
    }
  });

  it('declares every application service, handler, and transitional facade as a provider', () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AdvertisingModule) ?? [];
    for (const cls of [
      AdvertisingService,
      AdCampaignsService,
      AdStrategyService,
      AdStrategyAgentService,
      AdGradeRulesService,
      AdBudgetAllocatorService,
      AdExposureService,
      AdRecommendService,
      AdBenchmarkService,
      AdCollectService,
      AdSyncService,
      AdActionService,
      AdExecutionService,
      AdConfigService,
      KeywordRankService,
      CompetitorTrackingService,
      AdCampaignIngestHandler,
      CoupangAdsDailyIngestHandler,
      KeywordRankIngestHandler,
      WingSalesRankIngestHandler,
      RawScrapeIngestHandler,
      TrafficIngestHandler,
      ChannelScrapePersistenceService,
    ]) {
      expect(providers).toContain(cls);
    }
  });

  it('binds every application/port/out/* token via a token-shaped provider', () => {
    const providers: unknown[] =
      Reflect.getMetadata(PROVIDERS_KEY, AdvertisingModule) ?? [];
    // Token-shaped providers are objects with a `provide` field; everything
    // else is a class provider. The repository/provider ports + OPERATION_ALERT_PORT
    // are bound via useExisting so application services depend on tokens
    // rather than concrete adapter classes.
    const tokenProviders = providers.filter(
      (p): p is { provide: unknown; useExisting?: unknown } =>
        typeof p === 'object' && p !== null && 'provide' in p,
    );
    expect(tokenProviders).toHaveLength(17);
    for (const provider of tokenProviders) {
      expect(provider.useExisting).toBeDefined();
    }
  });

  it('keeps public /api route prefixes for ads + ad-agent', () => {
    for (const controller of ADS_CONTROLLERS) {
      expect(Reflect.getMetadata(PATH_KEY, controller)).toBe('ads');
    }
    expect(Reflect.getMetadata(PATH_KEY, AdStrategyAgentController)).toBe('ad-agent');
    expect(Reflect.getMetadata(PATH_KEY, KeywordRankController)).toBe('ads/keyword-rank');
    expect(Reflect.getMetadata(PATH_KEY, CompetitorTrackingController)).toBe(
      'ads/competitors',
    );
    expect(Reflect.getMetadata(PATH_KEY, WingTrackedProductController)).toBe(
      'ads/wing-tracked-products',
    );
  });
});
