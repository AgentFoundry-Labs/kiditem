import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AbstractAgent,
  EventType,
  type BaseEvent,
  type RunAgentInput,
} from '@ag-ui/client';
import { EMPTY, firstValueFrom, of, type Observable } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ConversationSqliteEventHistory,
  resolveCopilotkitSqlitePath,
} from './copilotkit-sqlite-event-history';

const OWNER_A = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
};

const OWNER_B = {
  organizationId: '00000000-0000-4000-8000-000000000003',
  userId: '00000000-0000-4000-8000-000000000004',
};

const histories: ConversationSqliteEventHistory[] = [];

afterEach(async () => {
  for (const history of histories.splice(0)) history.close();
});

describe('ConversationSqliteEventHistory', () => {
  it('uses an explicit path first, an isolated test database, a production requirement, and the development default', () => {
    expect(resolveCopilotkitSqlitePath({
      NODE_ENV: 'test',
      KIDITEM_COPILOTKIT_SQLITE_PATH: '/configured/events.sqlite',
    }, '/workspace')).toBe('/configured/events.sqlite');
    expect(resolveCopilotkitSqlitePath({ NODE_ENV: 'test' }, '/workspace')).toBe(':memory:');
    expect(() => resolveCopilotkitSqlitePath({ NODE_ENV: 'production' }, '/workspace'))
      .toThrow('KIDITEM_COPILOTKIT_SQLITE_PATH is required in production');
    expect(resolveCopilotkitSqlitePath({ NODE_ENV: 'development' }, '/workspace'))
      .toBe('/workspace/.kiditem/agent-os/copilotkit-events.sqlite');
  });

  it('stores and replays canonical public AG-UI events across reconstruction without exposing its organization namespace', async () => {
    const fixture = await createFixture();
    try {
      const first = track(new ConversationSqliteEventHistory({ databasePath: fixture.databasePath }));
      await firstValueFrom(first.run(OWNER_A, runRequest('conversation-1', 'run-1', new CompletedAgent())).pipe(toArray()));
      first.close();
      histories.splice(histories.indexOf(first), 1);

      const rebuilt = track(new ConversationSqliteEventHistory({ databasePath: fixture.databasePath }));
      await expect(firstValueFrom(rebuilt.connect(OWNER_A, { threadId: 'conversation-1' }).pipe(toArray())))
        .resolves.toEqual([
          { type: EventType.RUN_STARTED, threadId: 'conversation-1', runId: 'run-1', input: expect.any(Object) },
          { type: EventType.TEXT_MESSAGE_START, messageId: 'assistant-run-1', role: 'assistant' },
          { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'assistant-run-1', delta: 'Stored answer.' },
          { type: EventType.TEXT_MESSAGE_END, messageId: 'assistant-run-1' },
          { type: EventType.RUN_FINISHED, threadId: 'conversation-1', runId: 'run-1', outcome: { type: 'success' } },
        ]);
    } finally {
      await fixture.dispose();
    }
  });

  it('fences the same public conversation ID by authenticated organization namespace', async () => {
    const history = track(new ConversationSqliteEventHistory({ databasePath: ':memory:' }));
    await firstValueFrom(history.run(OWNER_A, runRequest('same-conversation', 'run-a', new CompletedAgent())).pipe(toArray()));

    await expect(firstValueFrom(history.connect(OWNER_B, { threadId: 'same-conversation' }).pipe(toArray())))
      .resolves.toEqual([]);
  });

  it('deletes only one exact organization-scoped completed conversation chain', async () => {
    const history = track(new ConversationSqliteEventHistory({ databasePath: ':memory:' }));
    await firstValueFrom(history.run(OWNER_A, runRequest('delete-me', 'run-delete', new CompletedAgent())).pipe(toArray()));
    await firstValueFrom(history.run(OWNER_A, runRequest('retain-me', 'run-retain', new CompletedAgent())).pipe(toArray()));

    history.delete(OWNER_A, { conversationId: 'delete-me' });

    await expect(firstValueFrom(history.connect(OWNER_A, { threadId: 'delete-me' }).pipe(toArray()))).resolves.toEqual([]);
    await expect(firstValueFrom(history.connect(OWNER_A, { threadId: 'retain-me' }).pipe(toArray())))
      .resolves.toContainEqual(expect.objectContaining({ runId: 'run-retain' }));
  });

  it('replays the bounded approval CUSTOM event, fences it by organization, and removes it with its conversation', async () => {
    const fixture = await createFixture();
    const invocationId = '00000000-0000-4000-8000-000000000010';
    try {
      const first = track(new ConversationSqliteEventHistory({ databasePath: fixture.databasePath }));
      await firstValueFrom(first.run(
        OWNER_A,
        runRequest('approval-conversation', 'approval-run', new ApprovalRequiredAgent(invocationId)),
      ).pipe(toArray()));
      first.close();
      histories.splice(histories.indexOf(first), 1);

      const rebuilt = track(new ConversationSqliteEventHistory({ databasePath: fixture.databasePath }));
      await expect(firstValueFrom(rebuilt.connect(OWNER_A, { threadId: 'approval-conversation' }).pipe(toArray())))
        .resolves.toContainEqual({
          type: EventType.CUSTOM,
          name: 'kiditem.capability_approval_required',
          value: { invocationId },
        });
      await expect(firstValueFrom(rebuilt.connect(OWNER_B, { threadId: 'approval-conversation' }).pipe(toArray())))
        .resolves.toEqual([]);

      rebuilt.delete(OWNER_A, { conversationId: 'approval-conversation' });
      await expect(firstValueFrom(rebuilt.connect(OWNER_A, { threadId: 'approval-conversation' }).pipe(toArray())))
        .resolves.toEqual([]);
    } finally {
      await fixture.dispose();
    }
  });
});

class CompletedAgent extends AbstractAgent {
  protected override run(input: RunAgentInput): Observable<BaseEvent> {
    return of(
      { type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId },
      { type: EventType.TEXT_MESSAGE_START, messageId: `assistant-${input.runId}`, role: 'assistant' },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: `assistant-${input.runId}`, delta: 'Stored answer.' },
      { type: EventType.TEXT_MESSAGE_END, messageId: `assistant-${input.runId}` },
      { type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId, outcome: { type: 'success' } },
    );
  }

  protected override connect(): Observable<BaseEvent> {
    return EMPTY;
  }

  override clone(): AbstractAgent {
    return new CompletedAgent();
  }
}

class ApprovalRequiredAgent extends AbstractAgent {
  constructor(private readonly invocationId: string) {
    super();
  }

  protected override run(input: RunAgentInput): Observable<BaseEvent> {
    return of(
      { type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId },
      {
        type: EventType.CUSTOM,
        name: 'kiditem.capability_approval_required',
        value: { invocationId: this.invocationId },
      },
      { type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId, outcome: { type: 'success' } },
    );
  }

  protected override connect(): Observable<BaseEvent> {
    return EMPTY;
  }

  override clone(): AbstractAgent {
    return new ApprovalRequiredAgent(this.invocationId);
  }
}

function runRequest(threadId: string, runId: string, agent: AbstractAgent) {
  return {
    threadId,
    agent,
    input: {
      threadId,
      runId,
      state: {},
      messages: [{ id: `user-${runId}`, role: 'user' as const, content: 'Persist this answer.' }],
    },
  };
}

function track(history: ConversationSqliteEventHistory): ConversationSqliteEventHistory {
  histories.push(history);
  return history;
}

async function createFixture(): Promise<{ databasePath: string; dispose: () => Promise<void> }> {
  const directory = await mkdtemp(join(tmpdir(), 'kiditem-copilotkit-event-history-'));
  return {
    databasePath: join(directory, 'events.sqlite'),
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}
