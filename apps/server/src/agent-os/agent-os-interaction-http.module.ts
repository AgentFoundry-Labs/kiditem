import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConversationController } from './adapter/in/http/interaction/conversation.controller';
import { ConversationCopilotkitController } from './adapter/in/http/interaction/conversation-copilotkit.controller';
import { COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT } from './adapter/in/http/interaction/copilotkit-conversation-history.transport';
import { ConversationSqliteEventHistory } from './adapter/out/history/sqlite/copilotkit-sqlite-event-history';
import { GatewayConversationAdapter } from './adapter/out/runtime/gateway/gateway-conversation.adapter';
import { GatewayCommandQueue } from './adapter/out/runtime/gateway/gateway-command.queue';
import { GatewayCommandResponseBroker } from './adapter/out/runtime/gateway/gateway-command-response.broker';
import { GatewayControlSessionModule } from './adapter/out/runtime/gateway/gateway-control-session.module';
import { GatewayReadinessService } from './adapter/out/runtime/gateway/gateway-readiness.service';
import {
  CONVERSATION_ID_FACTORY,
  CONVERSATION_PORT,
  CONVERSATION_TURN_ID_FACTORY,
} from './application/port/in/capability/conversation.port';
import { GATEWAY_CONVERSATION_PORT } from './application/port/out/gateway-conversation.port';
import { CONVERSATION_EVENT_HISTORY_PORT } from './application/port/out/history/conversation-event-history.port';
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
    {
      provide: ConversationSqliteEventHistory,
      useFactory: () => new ConversationSqliteEventHistory(),
    },
    { provide: CONVERSATION_EVENT_HISTORY_PORT, useExisting: ConversationSqliteEventHistory },
    { provide: COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT, useExisting: ConversationSqliteEventHistory },
    { provide: CONVERSATION_ID_FACTORY, useValue: randomUUID },
    { provide: CONVERSATION_TURN_ID_FACTORY, useValue: randomUUID },
    ConversationService,
    { provide: CONVERSATION_PORT, useExisting: ConversationService },
  ],
})
export class AgentOsInteractionHttpModule {}
