import type { BaseEvent } from '@ag-ui/client';
import type {
  AgentRunnerConnectRequest,
  AgentRunnerRunRequest,
} from '@copilotkit/runtime/v2';
import type { Observable } from 'rxjs';
import type { ConversationOwner } from '../../../../application/port/in/capability/conversation.port';

/**
 * HTTP interaction transport seam for authenticated owner-scoped run and
 * connect. It deliberately excludes deletion, application ownership, and
 * execution authority; the SQLite adapter supplies completed-event history.
 */
export interface CopilotkitConversationHistoryTransport {
  run(owner: ConversationOwner, request: AgentRunnerRunRequest): Observable<BaseEvent>;
  connect(owner: ConversationOwner, request: AgentRunnerConnectRequest): Observable<BaseEvent>;
}

export const COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT = Symbol('COPILOTKIT_CONVERSATION_HISTORY_TRANSPORT');
