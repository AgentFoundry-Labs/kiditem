import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConversationController } from './adapter/in/http/interaction/conversation.controller';
import { ConversationCopilotkitController } from './adapter/in/http/interaction/conversation-copilotkit.controller';
import { GatewayConversationAdapter } from './adapter/out/runtime/gateway/gateway-conversation.adapter';
import { GatewayCommandQueue } from './adapter/out/runtime/gateway/gateway-command.queue';
import { GatewayCommandResponseBroker } from './adapter/out/runtime/gateway/gateway-command-response.broker';
import { GatewayControlSessionModule } from './adapter/out/runtime/gateway/gateway-control-session.module';
import { GatewayReadinessService } from './adapter/out/runtime/gateway/gateway-readiness.service';
import {
  CONVERSATION_PORT,
  CONVERSATION_TURN_ID_FACTORY,
} from './application/port/in/capability/conversation.port';
import { GATEWAY_CONVERSATION_PORT } from './application/port/out/gateway-conversation.port';
import { ConversationService } from './application/service/conversation.service';
import { AgentOsHttpModule } from './agent-os-http.module';

/** API-root-only ownership for browser interaction transport. */
@Module({
  imports: [AgentOsHttpModule, GatewayControlSessionModule],
  controllers: [ConversationController, ConversationCopilotkitController],
  providers: [
    {
      provide: GATEWAY_CONVERSATION_PORT,
      inject: [GatewayCommandQueue, GatewayCommandResponseBroker, GatewayReadinessService],
      useFactory: (
        queue: GatewayCommandQueue,
        broker: GatewayCommandResponseBroker,
        readiness: GatewayReadinessService,
      ) => new GatewayConversationAdapter(queue, broker, readiness),
    },
    { provide: CONVERSATION_TURN_ID_FACTORY, useValue: randomUUID },
    ConversationService,
    { provide: CONVERSATION_PORT, useExisting: ConversationService },
  ],
})
export class AgentOsInteractionHttpModule {}
