import { Module } from '@nestjs/common';
import { GatewayControlController } from '../../../in/http/runtime/gateway-control.controller';
import { ExecutionBindingRegistry } from './execution-binding.registry';
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
    { provide: ExecutionBindingRegistry, useFactory: () => new ExecutionBindingRegistry() },
    GatewayReadinessService,
    { provide: GatewayCommandResponseBroker, useFactory: () => new GatewayCommandResponseBroker() },
    { provide: GatewayInstallationBearerService, useFactory: () => gatewayInstallationBearerFromEnvironment() },
    {
      provide: GatewayCommandQueue,
      inject: [ExecutionBindingRegistry, GatewayInstallationBearerService, GatewayCommandResponseBroker, GatewayReadinessService],
      useFactory: (bindings: ExecutionBindingRegistry, bearer: GatewayInstallationBearerService, broker: GatewayCommandResponseBroker, readiness: GatewayReadinessService) => new GatewayCommandQueue({
        bindings,
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
    ExecutionBindingRegistry,
    GatewayCommandQueue,
    GatewayEventHandlerService,
    GatewayCommandResponseBroker,
    GatewayReadinessService,
  ],
})
export class GatewayControlSessionModule {}
