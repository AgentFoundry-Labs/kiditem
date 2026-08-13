import { Injectable } from '@nestjs/common';
import type {
  AgentConversationLivePointer,
  AgentConversationLivePublisherPort,
} from '../../../application/port/out/event/agent-conversation-live-publisher.port';

@Injectable()
export class InProcessAgentConversationLivePublisher
implements AgentConversationLivePublisherPort {
  private readonly listeners = new Map<
    string,
    Set<(pointer: AgentConversationLivePointer) => void>
  >();

  async publish(pointer: AgentConversationLivePointer): Promise<void> {
    for (const listener of this.listeners.get(scopeKey(pointer)) ?? []) {
      listener({ ...pointer });
    }
  }

  subscribe(
    scope: Pick<AgentConversationLivePointer, 'organizationId' | 'sessionId'>,
    listener: (pointer: AgentConversationLivePointer) => void,
  ): () => void {
    const key = scopeKey(scope);
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(key);
    };
  }
}

function scopeKey(
  scope: Pick<AgentConversationLivePointer, 'organizationId' | 'sessionId'>,
): string {
  return JSON.stringify([scope.organizationId, scope.sessionId]);
}
