import type {
  AgentKey,
  ConversationSummary,
  ProviderRuntime,
} from '@kiditem/shared/agent-runtime';

export interface ConversationFirstSend {
  draftId: string;
  runtime: ProviderRuntime;
  agentKey: AgentKey | null;
  title: string;
  message: string;
  model: string;
  reasoningEffort: string;
}

export interface PromotedConversationFirstSend extends ConversationFirstSend {
  conversationId: string;
}

interface ConversationCreate {
  runtime: ProviderRuntime;
  agentKey: AgentKey | null;
  title: string;
}

export interface ConversationFirstSendCoordinatorDependencies {
  createConversation(input: ConversationCreate): Promise<ConversationSummary>;
  cacheSummary(summary: ConversationSummary): void;
  promoteDraft(draftId: string, summary: ConversationSummary): void;
  handoff(input: PromotedConversationFirstSend): Promise<void>;
  isCurrent?(draftId: string, conversationId?: string): boolean;
}

interface FirstSendEntry {
  createCanonicalJson: string;
  firstSendCanonicalJson: string;
  handoffIssued: boolean;
  cancelled: boolean;
  promise: Promise<void>;
}

/**
 * Coordinates the one irreversible transition from a browser-only draft key
 * to its server-identified Gateway conversation. Entries intentionally live until the
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
    const existing = this.entries.get(input.draftId);
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
          if (!this.entryIsCurrent(input.draftId, entry)) return;
          this.dependencies.promoteDraft(input.draftId, summary);
          if (!this.entryIsCurrent(input.draftId, entry, summary.id)) return;
          // Set this before invoking the mounted binding: synchronous throws
          // must still count as a consumed handoff and never auto-replay.
          entry.handoffIssued = true;
          return this.dependencies.handoff({ ...input, conversationId: summary.id });
        },
        (error: unknown) => {
          if (this.entries.get(input.draftId) === entry) {
            this.entries.delete(input.draftId);
          }
          throw error;
        },
      );
    entry.createCanonicalJson = createCanonicalJson;
    entry.firstSendCanonicalJson = firstSendCanonicalJson;
    entry.handoffIssued = false;
    entry.cancelled = false;
    entry.promise = promise;
    this.entries.set(input.draftId, entry);
    return promise;
  }

  dispose(draftId: string): void {
    const entry = this.entries.get(draftId);
    if (entry) entry.cancelled = true;
    this.entries.delete(draftId);
  }

  private entryIsCurrent(
    draftId: string,
    entry: FirstSendEntry,
    conversationId?: string,
  ): boolean {
    return !entry.cancelled
      && this.entries.get(draftId) === entry
      && (this.dependencies.isCurrent?.(draftId, conversationId) ?? true);
  }
}

function createFromFirstSend(input: ConversationFirstSend): ConversationCreate {
  return {
    runtime: input.runtime,
    agentKey: input.agentKey,
    title: input.title,
  };
}
