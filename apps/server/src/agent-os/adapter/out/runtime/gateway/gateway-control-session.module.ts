import { Module } from '@nestjs/common';
import { GatewayControlController } from '../../../in/http/runtime/gateway-control.controller';
import { GatewayMcpRuntimeRegistry } from './gateway-mcp-runtime.registry';
import { GatewayCommandQueue } from './gateway-command.queue';
import { GatewayCommandResponseBroker } from './gateway-command-response.broker';
import { GatewayEventHandlerService } from './gateway-event-handler.service';
import {
  GatewayInstallationBearerService,
  gatewayInstallationBearerFromEnvironment,
} from './gateway-installation-bearer.service';
import { GatewayReadinessService } from './gateway-readiness.service';

/** Owns every process-memory Gateway control primitive; no database state exists here. */
@Module({
  controllers: [GatewayControlController],
  providers: [
    { provide: GatewayMcpRuntimeRegistry, useFactory: () => new GatewayMcpRuntimeRegistry() },
    GatewayReadinessService,
    { provide: GatewayCommandResponseBroker, useFactory: () => new GatewayCommandResponseBroker() },
    { provide: GatewayInstallationBearerService, useFactory: () => gatewayInstallationBearerFromEnvironment() },
    {
      provide: GatewayCommandQueue,
      inject: [GatewayMcpRuntimeRegistry, GatewayInstallationBearerService, GatewayCommandResponseBroker, GatewayReadinessService],
      useFactory: (runtime: GatewayMcpRuntimeRegistry, bearer: GatewayInstallationBearerService, broker: GatewayCommandResponseBroker, readiness: GatewayReadinessService) => new GatewayCommandQueue({
        runtime,
        installationId: bearer.installationId,
        onTransientClear: () => {
          broker.disconnect();
          readiness.clear();
        },
      }),
    },
    {
      provide: GatewayEventHandlerService,
      inject: [GatewayCommandQueue, GatewayReadinessService, GatewayCommandResponseBroker],
      useFactory: (queue: GatewayCommandQueue, readiness: GatewayReadinessService, broker: GatewayCommandResponseBroker) => new GatewayEventHandlerService({ queue, readiness, broker }),
    },
  ],
  exports: [
    GatewayMcpRuntimeRegistry,
    GatewayCommandQueue,
    GatewayEventHandlerService,
    GatewayCommandResponseBroker,
    GatewayReadinessService,
  ],
})
export class GatewayControlSessionModule {}
