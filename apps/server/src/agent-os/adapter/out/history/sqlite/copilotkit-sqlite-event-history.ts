import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { SqliteAgentRunner } from '@kiditem/copilotkit-sqlite-runner';
import type {
  AgentRunnerConnectRequest,
  AgentRunnerRunRequest,
} from '@copilotkit/runtime/v2';
import { AbstractAgent, type BaseEvent, type RunAgentInput } from '@ag-ui/client';
import { EMPTY, map, type Observable } from 'rxjs';
import type { ConversationOwner } from '../../../../application/port/in/capability/conversation.port';
import type { ConversationEventHistoryPort } from '../../../../application/port/out/history/conversation-event-history.port';

export interface ConversationSqliteEventHistoryOptions {
  databasePath?: string;
  environment?: NodeJS.ProcessEnv;
  workingDirectory?: string;
}

/**
 * One Nest-owned SQLite runner for completed canonical AG-UI interaction
 * events. Its private database key is organization namespaced, while all
 * passed-through AG-UI events keep the browser's public conversation ID.
 */
@Injectable()
export class ConversationSqliteEventHistory implements ConversationEventHistoryPort, OnModuleDestroy {
  private readonly runner: SqliteAgentRunner;
  private closed = false;

  constructor(options: ConversationSqliteEventHistoryOptions = {}) {
    const databasePath = options.databasePath
      ?? resolveCopilotkitSqlitePath(options.environment ?? process.env, options.workingDirectory ?? process.cwd());
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.runner = new SqliteAgentRunner({ dbPath: databasePath });
  }

  run(owner: ConversationOwner, request: AgentRunnerRunRequest): Observable<BaseEvent> {
    const publicThreadId = request.threadId;
    if (request.input.threadId !== publicThreadId) {
      throw new Error('conversation_event_thread_mismatch');
    }
    return this.runner.run({
      ...request,
      agent: new PublicThreadAgent(request.agent, request.input),
      threadId: namespacedThreadId(owner, publicThreadId),
      input: {
        ...request.input,
        threadId: publicThreadId,
      },
    });
  }

  connect(owner: ConversationOwner, request: AgentRunnerConnectRequest): Observable<BaseEvent> {
    return this.runner.connect({
      ...request,
      threadId: namespacedThreadId(owner, request.threadId),
    });
  }

  delete(owner: ConversationOwner, input: { conversationId: string }): void {
    this.runner.deleteThread(namespacedThreadId(owner, input.conversationId));
  }

  onModuleDestroy(): void {
    this.close();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.runner.close();
  }
}

export function resolveCopilotkitSqlitePath(
  environment: NodeJS.ProcessEnv = process.env,
  workingDirectory = process.cwd(),
): string {
  const configured = environment.KIDITEM_COPILOTKIT_SQLITE_PATH?.trim();
  if (configured) return configured;
  if (environment.NODE_ENV === 'test') return ':memory:';
  if (environment.NODE_ENV === 'production') {
    throw new Error('KIDITEM_COPILOTKIT_SQLITE_PATH is required in production');
  }
  return join(workingDirectory, '.kiditem', 'agent-os', 'copilotkit-events.sqlite');
}

function namespacedThreadId(owner: ConversationOwner, conversationId: string): string {
  return `kiditem:v1:${Buffer.from(JSON.stringify([owner.organizationId, conversationId]), 'utf8').toString('base64url')}`;
}

/**
 * The SQLite key is deliberately private. AbstractAgent otherwise allocates a
 * per-instance thread ID, so normalize only protocol identifiers at the edge
 * before the runner records or replays them.
 */
class PublicThreadAgent extends AbstractAgent {
  constructor(
    private readonly delegate: AbstractAgent,
    input: Pick<RunAgentInput, 'threadId' | 'messages' | 'state'>,
  ) {
    super({
      agentId: delegate.agentId,
      description: delegate.description,
      threadId: input.threadId,
      initialMessages: input.messages,
      initialState: input.state,
    });
    this.publicThreadId = input.threadId;
  }

  private readonly publicThreadId: string;

  override run(input: RunAgentInput): Observable<BaseEvent> {
    return this.delegate.run(input).pipe(map((event) => normalizeEventThread(event, this.publicThreadId, input.runId)));
  }

  protected override connect(): Observable<BaseEvent> {
    return EMPTY;
  }

  override abortRun(): void {
    // The stock runner does not carry a run ID through abort. Browser control
    // goes only through Nest's authenticated exact-stop seam, and this wrapper
    // must not let a generic runner abort select whichever provider turn is live.
  }

  override clone(): AbstractAgent {
    return new PublicThreadAgent(this.delegate.clone(), {
      threadId: this.publicThreadId,
      state: this.state,
      messages: this.messages,
    });
  }
}

function normalizeEventThread(event: BaseEvent, threadId: string, runId: string): BaseEvent {
  const normalized: Record<string, unknown> = { ...event };
  if ('threadId' in event) normalized.threadId = threadId;
  if ('runId' in event) normalized.runId = runId;
  return normalized as BaseEvent;
}
