import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { KeywordRankRepositoryAdapter } from '../advertising/adapter/out/repository/keyword-rank.repository.adapter';
import { COUPANG_MOMENTUM_READ_CAPABILITY_PORT } from '../advertising/application/port/in/capability/coupang-momentum-read.port';
import { KEYWORD_RANK_REPOSITORY_PORT } from '../advertising/application/port/out/repository/keyword-rank.repository.port';
import { CoupangMomentumReadService } from '../advertising/application/service/coupang-momentum-read.service';
import { OperationsModule } from '../operations/operations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT } from './application/port/out/repository/sourcing-browser-source-attempt.repository.port';
import { SourcingBrowserSourceAttemptRepositoryAdapter } from './adapter/out/repository/sourcing-browser-source-attempt.repository.adapter';
import { SourcingScrapeUrlOperationHandler } from './adapter/in/operation/sourcing-scrape-url.operation-handler';
import { SourcingShadowSignalOperationHandler } from './adapter/in/operation/sourcing-shadow-signal.operation-handler';
import { NaverKeywordResearchService } from './application/service/naver-keyword-research.service';
import { Sourcing1688ImageSearchService } from './application/service/sourcing-1688-image-search.service';
import { Sourcing1688KeywordSearchService } from './application/service/sourcing-1688-keyword-search.service';
import { SourcingRecommendationService } from './application/service/sourcing-recommendation.service';
import { SourcingRisingProductService } from './application/service/sourcing-rising-product.service';
import { SourcingScrapeResultService } from './application/service/sourcing-scrape-result.service';
import { SourcingShadowSignalService } from './application/service/sourcing-shadow-signal.service';
import { TrendCollectService } from './application/service/trend-collect.service';
import { SourcingPlaywrightRuntimeHandler } from './adapter/out/runtime/sourcing-playwright-runtime.handler';
import { Direct1688ImageSearchAdapter } from './adapter/out/1688/direct-1688-image-search.adapter';
import { Direct1688KeywordSearchAdapter } from './adapter/out/1688/direct-1688-keyword-search.adapter';
import { CoupangMomentumAdapter } from './adapter/out/advertising/coupang-momentum.adapter';
import { GoogleTrendsRssAdapter } from './adapter/out/google-trends/google-trends-rss.adapter';
import { LinkfoxEchotikShadowAdapter } from './adapter/out/linkfox/linkfox-echotik-shadow.adapter';
import { NaverAutocompleteKeywordAdapter } from './adapter/out/naver/naver-autocomplete-keyword.adapter';
import { NaverDatalabPopularKeywordAdapter } from './adapter/out/naver/naver-datalab-popular-keyword.adapter';
import { NaverDatalabTrendAdapter } from './adapter/out/naver/naver-datalab-trend.adapter';
import { NaverSearchAdKeywordAdapter } from './adapter/out/naver/naver-search-ad-keyword.adapter';
import { MarketShadowSnapshotRepositoryAdapter } from './adapter/out/repository/market-shadow-snapshot.repository.adapter';
import { Sourcing1688SearchResultRepositoryAdapter } from './adapter/out/repository/sourcing-1688-search-result.repository.adapter';
import { SourcingCandidateRepositoryAdapter } from './adapter/out/repository/sourcing-candidate.repository.adapter';
import { SourcingInterestTargetRepositoryAdapter } from './adapter/out/repository/sourcing-interest-target.repository.adapter';
import { SourcingRecommendationSourceRepositoryAdapter } from './adapter/out/repository/sourcing-recommendation-source.repository.adapter';
import { SourcingRecommendationRepositoryAdapter } from './adapter/out/repository/sourcing-recommendation.repository.adapter';
import { SourcingWorkspaceSnapshotRepositoryAdapter } from './adapter/out/repository/sourcing-workspace-snapshot.repository.adapter';
import { TrendCollectionRepositoryAdapter } from './adapter/out/repository/trend-collection.repository.adapter';
import { ShortstrendTrendAdapter } from './adapter/out/shortstrend/shortstrend-trend.adapter';
import { SOURCING_1688_IMAGE_SEARCH_PORT } from './application/port/out/provider/1688-image-search.port';
import { SOURCING_1688_KEYWORD_SEARCH_PORT } from './application/port/out/provider/1688-keyword-search.port';
import { COUPANG_MOMENTUM_PORT } from './application/port/out/cross-domain/coupang-momentum.port';
import {
  LINKFOX_ECHOTIK_SHADOW_PORT,
  MARKET_SHADOW_SIGNAL_PORT,
} from './application/port/out/provider/market-shadow-signal.port';
import {
  SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT,
  SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT,
  SOURCING_NAVER_DATALAB_TREND_PORT,
  SOURCING_NAVER_KEYWORD_RESEARCH_PORT,
} from './application/port/out/provider/naver-keyword-research.port';
import { SHORTSTREND_TREND_PORT } from './application/port/out/provider/shortstrend-trend.port';
import { MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT } from './application/port/out/repository/market-shadow-snapshot.repository.port';
import { SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT } from './application/port/out/repository/sourcing-1688-search-result.repository.port';
import { SOURCING_CANDIDATE_REPOSITORY_PORT } from './application/port/out/repository/sourcing-candidate.repository.port';
import { SOURCING_INTEREST_TARGET_REPOSITORY_PORT } from './application/port/out/repository/sourcing-interest-target.repository.port';
import { SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT } from './application/port/out/repository/sourcing-recommendation-source.repository.port';
import { SOURCING_RECOMMENDATION_REPOSITORY_PORT } from './application/port/out/repository/sourcing-recommendation.repository.port';
import { SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT } from './application/port/out/repository/sourcing-workspace-snapshot.repository.port';
import { TREND_COLLECTION_REPOSITORY_PORT } from './application/port/out/repository/trend-collection.repository.port';
import { TREND_COLLECTION_PORT } from './application/port/in/trend-collection.port';

/**
 * Controller-free execution composition for Sourcing-owned Operations. API,
 * Agent OS, and browser-host runtimes remain outside the worker process.
 */
@Module({
  imports: [PrismaModule, OperationsModule, AlertsModule],
  providers: [
    SourcingBrowserSourceAttemptRepositoryAdapter,
    { provide: SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT, useExisting: SourcingBrowserSourceAttemptRepositoryAdapter },
    SourcingScrapeUrlOperationHandler,
    SourcingShadowSignalOperationHandler,
    NaverKeywordResearchService,
    Sourcing1688ImageSearchService,
    Sourcing1688KeywordSearchService,
    SourcingRecommendationService,
    SourcingRisingProductService,
    TrendCollectService,
    SourcingScrapeResultService,
    SourcingShadowSignalService,
    SourcingPlaywrightRuntimeHandler,
    NaverDatalabPopularKeywordAdapter,
    NaverDatalabTrendAdapter,
    NaverAutocompleteKeywordAdapter,
    NaverSearchAdKeywordAdapter,
    Direct1688ImageSearchAdapter,
    Direct1688KeywordSearchAdapter,
    ShortstrendTrendAdapter,
    TrendCollectionRepositoryAdapter,
    SourcingWorkspaceSnapshotRepositoryAdapter,
    SourcingRecommendationSourceRepositoryAdapter,
    SourcingRecommendationRepositoryAdapter,
    SourcingInterestTargetRepositoryAdapter,
    Sourcing1688SearchResultRepositoryAdapter,
    SourcingCandidateRepositoryAdapter,
    GoogleTrendsRssAdapter,
    LinkfoxEchotikShadowAdapter,
    MarketShadowSnapshotRepositoryAdapter,
    KeywordRankRepositoryAdapter,
    CoupangMomentumReadService,
    CoupangMomentumAdapter,
    { provide: SOURCING_NAVER_KEYWORD_RESEARCH_PORT, useExisting: NaverSearchAdKeywordAdapter },
    { provide: SOURCING_NAVER_DATALAB_TREND_PORT, useExisting: NaverDatalabTrendAdapter },
    { provide: SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT, useExisting: NaverDatalabPopularKeywordAdapter },
    { provide: SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT, useExisting: NaverAutocompleteKeywordAdapter },
    { provide: SOURCING_1688_IMAGE_SEARCH_PORT, useExisting: Direct1688ImageSearchAdapter },
    { provide: SOURCING_1688_KEYWORD_SEARCH_PORT, useExisting: Direct1688KeywordSearchAdapter },
    { provide: SHORTSTREND_TREND_PORT, useExisting: ShortstrendTrendAdapter },
    { provide: TREND_COLLECTION_REPOSITORY_PORT, useExisting: TrendCollectionRepositoryAdapter },
    { provide: SOURCING_WORKSPACE_SNAPSHOT_REPOSITORY_PORT, useExisting: SourcingWorkspaceSnapshotRepositoryAdapter },
    { provide: SOURCING_RECOMMENDATION_SOURCE_REPOSITORY_PORT, useExisting: SourcingRecommendationSourceRepositoryAdapter },
    { provide: SOURCING_RECOMMENDATION_REPOSITORY_PORT, useExisting: SourcingRecommendationRepositoryAdapter },
    { provide: SOURCING_INTEREST_TARGET_REPOSITORY_PORT, useExisting: SourcingInterestTargetRepositoryAdapter },
    { provide: SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT, useExisting: Sourcing1688SearchResultRepositoryAdapter },
    { provide: SOURCING_CANDIDATE_REPOSITORY_PORT, useExisting: SourcingCandidateRepositoryAdapter },
    { provide: MARKET_SHADOW_SIGNAL_PORT, useExisting: GoogleTrendsRssAdapter },
    { provide: LINKFOX_ECHOTIK_SHADOW_PORT, useExisting: LinkfoxEchotikShadowAdapter },
    { provide: MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT, useExisting: MarketShadowSnapshotRepositoryAdapter },
    { provide: TREND_COLLECTION_PORT, useExisting: TrendCollectService },
    { provide: KEYWORD_RANK_REPOSITORY_PORT, useExisting: KeywordRankRepositoryAdapter },
    { provide: COUPANG_MOMENTUM_READ_CAPABILITY_PORT, useExisting: CoupangMomentumReadService },
    { provide: COUPANG_MOMENTUM_PORT, useExisting: CoupangMomentumAdapter },
  ],
})
export class SourcingOperationWorkerModule {}
