import type { ProviderMessage, ProviderReadiness } from '@kiditem/shared/agent-runtime';
import type { CodexAppServerSession } from './codex-app-server-session';
import type {
  CreateProviderConversation,
  InterruptProviderTurn,
  ProviderConversation,
  ProviderConversationPort,
  ProviderConversationSummary,
  ProviderEventSink,
  SendProviderInput,
  StartProviderTurn,
} from './provider-conversation.port';

const MAX_ARCHIVE_RECONCILIATION_PAGES = 4;

/** Provider-port adapter over one persistent Codex app-server thread session. */
export class CodexConversationProvider implements ProviderConversationPort {
  readonly runtime = 'codex_cli' as const;

  constructor(private readonly options: Readonly<{
    session: Pick<CodexAppServerSession,
      'listConversations' | 'listConversationsPage' | 'createConversation' | 'history' | 'rename' | 'archive' | 'startTurn' | 'steer' | 'interrupt'>;
    readiness: ProviderReadiness;
  }>) {}

  list(): Promise<ProviderConversationSummary[]> { return this.options.session.listConversations(); }
  create(input: CreateProviderConversation): Promise<ProviderConversation> { return this.options.session.createConversation(input); }
  history(providerConversationRef: string): Promise<ProviderMessage[]> { return this.options.session.history(providerConversationRef); }
  rename(providerConversationRef: string, title: string): Promise<void> { return this.options.session.rename(providerConversationRef, title); }
  async delete(providerConversationRef: string): Promise<void> {
    try {
      await this.options.session.archive(providerConversationRef);
      return;
    } catch {
      try {
        let cursor: string | undefined;
        const seenCursors = new Set<string>();
        for (let pageNumber = 0; pageNumber < MAX_ARCHIVE_RECONCILIATION_PAGES; pageNumber += 1) {
          const page = await this.options.session.listConversationsPage(cursor);
          if (page.conversations.some((conversation) => conversation.providerConversationRef === providerConversationRef)) break;
          if (page.nextCursor === null) return;
          if (seenCursors.has(page.nextCursor)) break;
          seenCursors.add(page.nextCursor);
          cursor = page.nextCursor;
        }
      } catch {
        // Preserve a bounded adapter failure rather than raw app-server data.
      }
      throw new Error('codex_provider_delete_failed');
    }
  }
  startTurn(input: StartProviderTurn, sink: ProviderEventSink): Promise<void> { return this.options.session.startTurn(input, sink); }
  sendInput(input: SendProviderInput): Promise<void> { return this.options.session.steer(input); }
  interrupt(input: InterruptProviderTurn): Promise<void> { return this.options.session.interrupt(input); }

  async readiness(): Promise<ProviderReadiness> {
    if (this.options.readiness.runtime !== this.runtime) throw new Error('codex_readiness_invalid');
    return this.options.readiness;
  }
}
