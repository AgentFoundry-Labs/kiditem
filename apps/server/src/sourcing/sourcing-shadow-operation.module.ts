import { Module } from '@nestjs/common';
import { AgentOsSessionModule } from '../agent-os/agent-os-session.module';
import { AgentOsCapabilityModule } from '../agent-os/agent-os-capability.module';
import { AgentApiShadowCapabilityGrantGuard } from '../agent-os/adapter/in/http/agent-api-shadow-capability-grant.guard';
import { OperationsModule } from '../operations/operations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketShadowSignalCapabilityAdapter } from './adapter/in/agent/market-shadow-signal-capability.adapter';
import { InternalMarketShadowOperationController } from './adapter/in/http/internal-market-shadow-operation.controller';
import { SourcingShadowSignalOperationHandler } from './adapter/in/operation/sourcing-shadow-signal.operation-handler';
import { GoogleTrendsRssAdapter } from './adapter/out/google-trends/google-trends-rss.adapter';
import { LinkfoxEchotikShadowAdapter } from './adapter/out/linkfox/linkfox-echotik-shadow.adapter';
import { MarketShadowOperationAdapter } from './adapter/out/operations/market-shadow-operation.adapter';
import { MarketShadowSnapshotRepositoryAdapter } from './adapter/out/repository/market-shadow-snapshot.repository.adapter';
import { MARKET_SHADOW_COLLECTION_CAPABILITY_PORT } from './application/port/in/capability/market-shadow-capability.port';
import { MARKET_SHADOW_OPERATION_PORT } from './application/port/out/cross-domain/market-shadow-operation.port';
import {
  LINKFOX_ECHOTIK_SHADOW_PORT,
  MARKET_SHADOW_SIGNAL_PORT,
} from './application/port/out/provider/market-shadow-signal.port';
import { MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT } from './application/port/out/repository/market-shadow-snapshot.repository.port';
import { SourcingShadowSignalService } from './application/service/sourcing-shadow-signal.service';
import { SourcingAgentRuntimeModule } from './sourcing-agent-runtime.module';

/** API-only owner graph for fenced Shadow snapshot collection. */
@Module({
  imports: [
    PrismaModule,
    AgentOsSessionModule,
    AgentOsCapabilityModule,
    OperationsModule,
    SourcingAgentRuntimeModule,
  ],
  controllers: [InternalMarketShadowOperationController],
  providers: [
    AgentApiShadowCapabilityGrantGuard,
    MarketShadowSignalCapabilityAdapter,
    MarketShadowOperationAdapter,
    SourcingShadowSignalOperationHandler,
    SourcingShadowSignalService,
    GoogleTrendsRssAdapter,
    LinkfoxEchotikShadowAdapter,
    MarketShadowSnapshotRepositoryAdapter,
    {
      provide: MARKET_SHADOW_COLLECTION_CAPABILITY_PORT,
      useExisting: MarketShadowSignalCapabilityAdapter,
    },
    {
      provide: MARKET_SHADOW_OPERATION_PORT,
      useExisting: MarketShadowOperationAdapter,
    },
    {
      provide: MARKET_SHADOW_SIGNAL_PORT,
      useExisting: GoogleTrendsRssAdapter,
    },
    {
      provide: LINKFOX_ECHOTIK_SHADOW_PORT,
      useExisting: LinkfoxEchotikShadowAdapter,
    },
    {
      provide: MARKET_SHADOW_SNAPSHOT_REPOSITORY_PORT,
      useExisting: MarketShadowSnapshotRepositoryAdapter,
    },
  ],
  exports: [
    MARKET_SHADOW_OPERATION_PORT,
    SourcingShadowSignalService,
  ],
})
export class SourcingShadowOperationModule {}
