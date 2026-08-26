import type {
  AgentKey,
  ConversationSummary,
  ProviderRuntime,
} from '@kiditem/shared/agent-runtime';

export interface ConversationFirstSend {
  conversationId: string;
  runtime: ProviderRuntime;
  agentKey: AgentKey | null;
  title: string;
  message: string;
  model: string;
  reasoningEffort: string;
}

interface ConversationCreate {
  conversationId: string;
  runtime: ProviderRuntime;
  agentKey: AgentKey | null;
  title: string;
}

export interface ConversationFirstSendCoordinatorDependencies {
  createConversation(input: ConversationCreate): Promise<ConversationSummary>;
  cacheSummary(summary: ConversationSummary): void;
  selectConversation(summary: ConversationSummary): void;
  handoff(input: ConversationFirstSend): Promise<void>;
}

interface FirstSendEntry {
  createCanonicalJson: string;
  firstSendCanonicalJson: string;
  handoffIssued: boolean;
  promise: Promise<void>;
}

/**
 * Coordinates the one irreversible transition from a browser-reserved draft
 * to its Gateway-created conversation. Entries intentionally live until the
 * owning draft is disposed so reconnects cannot duplicate the first run.
 */
export class ConversationFirstSendCoordinator {
  private readonly entries = new Map<string, FirstSendEntry>();

  constructor(private readonly dependencies: ConversationFirstSendCoordinatorDependencies) {}

  send(input: ConversationFirstSend): Promise<void> {
    const create = createFromFirstSend(input);
    const createCanonicalJson = JSON.stringify({
      runtime: create.runtime,
      agentKey: create.agentKey,
      title: create.title,
    });
    const firstSendCanonicalJson = JSON.stringify({
      runtime: create.runtime,
      agentKey: create.agentKey,
      title: create.title,
      message: input.message,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
    });
    const existing = this.entries.get(input.conversationId);
    if (existing) {
      if (existing.createCanonicalJson !== createCanonicalJson
        || existing.firstSendCanonicalJson !== firstSendCanonicalJson) {
        return Promise.reject(new Error('conversation_first_send_conflict'));
      }
      return existing.promise;
    }

    const entry = {} as FirstSendEntry;
    const promise = Promise.resolve()
      .then(() => this.dependencies.createConversation(create))
      .then(
        (summary) => {
          this.dependencies.cacheSummary(summary);
          this.dependencies.selectConversation(summary);
          // Set this before invoking the mounted binding: synchronous throws
          // must still count as a consumed handoff and never auto-replay.
          entry.handoffIssued = true;
          return this.dependencies.handoff(input);
        },
        (error: unknown) => {
          if (this.entries.get(input.conversationId) === entry) {
            this.entries.delete(input.conversationId);
          }
          throw error;
        },
      );
    entry.createCanonicalJson = createCanonicalJson;
    entry.firstSendCanonicalJson = firstSendCanonicalJson;
    entry.handoffIssued = false;
    entry.promise = promise;
    this.entries.set(input.conversationId, entry);
    return promise;
  }

  dispose(conversationId: string): void {
    this.entries.delete(conversationId);
  }
}

function createFromFirstSend(input: ConversationFirstSend): ConversationCreate {
  return {
    conversationId: input.conversationId,
    runtime: input.runtime,
    agentKey: input.agentKey,
    title: input.title,
  };
}
