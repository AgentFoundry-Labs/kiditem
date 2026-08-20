import { Module } from '@nestjs/common';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { MarketShadowSignalCapabilityAdapter } from './adapter/in/agent/market-shadow-signal-capability.adapter';
import { MarketShadowOperationApiCommandAdapter } from './adapter/out/http/market-shadow-operation-api-command.adapter';
import { MARKET_SHADOW_COLLECTION_CAPABILITY_PORT } from './application/port/in/capability/market-shadow-capability.port';
import { MARKET_SHADOW_OPERATION_PORT } from './application/port/out/cross-domain/market-shadow-operation.port';

/** Agent worker/MCP graph: exact authenticated API command only, never Operations. */
@Module({
  imports: [AgentOsModule],
  providers: [
    MarketShadowSignalCapabilityAdapter,
    MarketShadowOperationApiCommandAdapter,
    {
      provide: MARKET_SHADOW_COLLECTION_CAPABILITY_PORT,
      useExisting: MarketShadowSignalCapabilityAdapter,
    },
    {
      provide: MARKET_SHADOW_OPERATION_PORT,
      useExisting: MarketShadowOperationApiCommandAdapter,
    },
  ],
})
export class SourcingAgentShadowOperationModule {}
