import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AbstractAgent,
  EventType,
  type BaseEvent,
  type RunAgentInput,
} from '@ag-ui/client';
import Database from 'better-sqlite3';
import { EMPTY, firstValueFrom, type Observable } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { describe, expect, it } from 'vitest';
import { SqliteAgentRunner } from '../index.js';

type AgentCallbacks = {
  onEvent: (input: { event: BaseEvent }) => Promise<void> | void;
  onRunStartedEvent?: () => Promise<void> | void;
};

class ControlledTerminalAgent extends AbstractAgent {
  private resolveStarted!: () => void;
  private resolveFinish!: () => void;
  private readonly started = new Promise<void>((resolve) => { this.resolveStarted = resolve; });
  private readonly finishSignal = new Promise<void>((resolve) => { this.resolveFinish = resolve; });
  abortCalls = 0;

  async runAgent(input: RunAgentInput, callbacks: AgentCallbacks): Promise<void> {
    await callbacks.onEvent({
      event: { type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId },
    });
    await callbacks.onRunStartedEvent?.();
    this.resolveStarted();
    await this.finishSignal;
    await callbacks.onEvent({
      event: {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
        outcome: { type: 'success' },
      },
    });
  }

  override abortRun(): void {
    this.abortCalls += 1;
  }

  waitForStart(): Promise<void> {
    return this.started;
  }

  finish(): void {
    this.resolveFinish();
  }

  protected override run(): Observable<BaseEvent> {
    return EMPTY;
  }

  protected override connect(): Observable<BaseEvent> {
    return EMPTY;
  }

  override clone(): AbstractAgent {
    return new ControlledTerminalAgent();
  }
}

class CompletedAgent extends AbstractAgent {
  async runAgent(input: RunAgentInput, callbacks: AgentCallbacks): Promise<void> {
    await callbacks.onEvent({
      event: { type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId },
    });
    await callbacks.onRunStartedEvent?.();
    await callbacks.onEvent({
      event: {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
        outcome: { type: 'success' },
      },
    });
  }

  protected override run(): Observable<BaseEvent> {
    return EMPTY;
  }

  protected override connect(): Observable<BaseEvent> {
    return EMPTY;
  }

  override clone(): AbstractAgent {
    return new CompletedAgent();
  }
}

describe('KidItem sqlite-runner lifecycle/storage delta', () => {
  it('keeps a run alive and replays its terminal event after the original subscriber leaves', async () => {
    const fixture = await createFixture();
    const runner = new SqliteAgentRunner({ dbPath: fixture.dbPath });
    const agent = new ControlledTerminalAgent();

    try {
      const subscription = runner.run(runRequest('subscriber-departure', 'run-1', agent)).subscribe();
      await agent.waitForStart();
      subscription.unsubscribe();
      agent.finish();

      await waitFor(async () => !(await runner.isRunning({ threadId: 'subscriber-departure' })));
      await expect(firstValueFrom(runner.connect({ threadId: 'subscriber-departure' }).pipe(toArray())))
        .resolves.toContainEqual(expect.objectContaining({
          type: EventType.RUN_FINISHED,
          threadId: 'subscriber-departure',
          runId: 'run-1',
        }));
    } finally {
      runner.close();
      await fixture.dispose();
    }
  });

  it('detaches an active connect bridge when its observer leaves without aborting the live run', async () => {
    const fixture = await createFixture();
    const runner = new SqliteAgentRunner({ dbPath: fixture.dbPath });
    const agent = new ControlledTerminalAgent();
    const threadId = 'connect-observer-departure';
    const completion = firstValueFrom(runner.run(runRequest(threadId, 'run-1', agent)).pipe(toArray()));

    try {
      await agent.waitForStart();

      const subscription = runner.connect({ threadId }).subscribe();
      expect(activeConnectBridgeCount(runner, threadId)).toBe(1);

      subscription.unsubscribe();
      expect(activeConnectBridgeCount(runner, threadId)).toBe(0);
      await expect(runner.isRunning({ threadId })).resolves.toBe(true);
      expect(agent.abortCalls).toBe(0);

      agent.finish();
      await completion;
      await expect(firstValueFrom(runner.connect({ threadId }).pipe(toArray())))
        .resolves.toContainEqual(expect.objectContaining({
          type: EventType.RUN_FINISHED,
          threadId,
          runId: 'run-1',
        }));
    } finally {
      agent.finish();
      await completion;
      runner.close();
      await fixture.dispose();
    }
  });

  it('ignores a stale durable run_state marker after reconstruction and accepts the next explicit run', async () => {
    const fixture = await createFixture();
    const stale = new Database(fixture.dbPath);
    stale.exec(`
      CREATE TABLE run_state (
        thread_id TEXT PRIMARY KEY,
        is_running INTEGER DEFAULT 0,
        current_run_id TEXT,
        updated_at INTEGER NOT NULL
      )
    `);
    stale.prepare(
      'INSERT INTO run_state (thread_id, is_running, current_run_id, updated_at) VALUES (?, ?, ?, ?)',
    ).run('restart-stale-lock', 1, 'run-before-restart', Date.now());
    stale.close();

    const runner = new SqliteAgentRunner({ dbPath: fixture.dbPath });
    try {
      await expect(runner.isRunning({ threadId: 'restart-stale-lock' })).resolves.toBe(false);
      const inspection = new Database(fixture.dbPath, { readonly: true });
      const legacyTable = inspection
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'run_state'")
        .get();
      inspection.close();
      expect(legacyTable).toBeUndefined();
      await expect(firstValueFrom(
        runner.run(runRequest('restart-stale-lock', 'run-after-restart', new CompletedAgent())).pipe(toArray()),
      )).resolves.toContainEqual(expect.objectContaining({ runId: 'run-after-restart' }));
    } finally {
      runner.close();
      await fixture.dispose();
    }
  });

  it('rejects a mismatched stop runId without aborting or releasing the exact active run', async () => {
    const fixture = await createFixture();
    const runner = new SqliteAgentRunner({ dbPath: fixture.dbPath });
    const agent = new ControlledTerminalAgent();
    const completion = firstValueFrom(runner.run(runRequest('exact-stop', 'run-active', agent)).pipe(toArray()));

    try {
      await agent.waitForStart();
      await expect(runner.stop({ threadId: 'exact-stop', runId: 'run-stale' })).resolves.toBe(false);
      expect(agent.abortCalls).toBe(0);
      await expect(runner.isRunning({ threadId: 'exact-stop' })).resolves.toBe(true);
    } finally {
      agent.finish();
      await completion;
      runner.close();
      await fixture.dispose();
    }
  });

  it('keeps a matching stop request active until the terminal event completes the run', async () => {
    const fixture = await createFixture();
    const runner = new SqliteAgentRunner({ dbPath: fixture.dbPath });
    const agent = new ControlledTerminalAgent();
    const completion = firstValueFrom(runner.run(runRequest('terminal-stop', 'run-active', agent)).pipe(toArray()));

    try {
      await agent.waitForStart();
      await expect(runner.stop({ threadId: 'terminal-stop', runId: 'run-active' })).resolves.toBe(true);
      expect(agent.abortCalls).toBe(1);
      await expect(runner.isRunning({ threadId: 'terminal-stop' })).resolves.toBe(true);

      agent.finish();
      await completion;
      await expect(runner.isRunning({ threadId: 'terminal-stop' })).resolves.toBe(false);
    } finally {
      agent.finish();
      await completion;
      runner.close();
      await fixture.dispose();
    }
  });

  it('keeps exact organization namespaces isolated in replay', async () => {
    const fixture = await createFixture();
    const runner = new SqliteAgentRunner({ dbPath: fixture.dbPath });
    const firstThread = namespaceThread('organization-a', 'same-public-id');
    const secondThread = namespaceThread('organization-b', 'same-public-id');

    try {
      await firstValueFrom(runner.run(runRequest(firstThread, 'run-organization-a', new CompletedAgent())).pipe(toArray()));
      await expect(firstValueFrom(runner.connect({ threadId: secondThread }).pipe(toArray()))).resolves.toEqual([]);
    } finally {
      runner.close();
      await fixture.dispose();
    }
  });

  it('migrates legacy global run IDs to a thread-scoped run key', async () => {
    const fixture = await createFixture();
    const legacy = new Database(fixture.dbPath);
    legacy.exec(`
      CREATE TABLE agent_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL,
        run_id TEXT NOT NULL UNIQUE,
        parent_run_id TEXT,
        events TEXT NOT NULL,
        input TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        version INTEGER NOT NULL
      );
      CREATE TABLE schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
      INSERT INTO schema_version (version, applied_at) VALUES (1, 0);
    `);
    legacy.close();

    const runner = new SqliteAgentRunner({ dbPath: fixture.dbPath });
    const firstThread = namespaceThread('organization-a', 'same-public-run');
    const secondThread = namespaceThread('organization-b', 'same-public-run');
    const sharedRunId = 'same-run-id';

    try {
      await firstValueFrom(runner.run(runRequest(firstThread, sharedRunId, new CompletedAgent())).pipe(toArray()));
      await firstValueFrom(runner.run(runRequest(secondThread, sharedRunId, new CompletedAgent())).pipe(toArray()));

      await expect(firstValueFrom(runner.connect({ threadId: firstThread }).pipe(toArray())))
        .resolves.toContainEqual(expect.objectContaining({ runId: sharedRunId }));
      await expect(firstValueFrom(runner.connect({ threadId: secondThread }).pipe(toArray())))
        .resolves.toContainEqual(expect.objectContaining({ runId: sharedRunId }));
    } finally {
      runner.close();
      await fixture.dispose();
    }
  });

  it('deletes exactly one completed namespaced event chain transactionally', async () => {
    const fixture = await createFixture();
    const runner = new SqliteAgentRunner({ dbPath: fixture.dbPath });
    const deletedThread = namespaceThread('organization-a', 'conversation-delete');
    const retainedThread = namespaceThread('organization-a', 'conversation-retain');

    try {
      await firstValueFrom(runner.run(runRequest(deletedThread, 'run-delete', new CompletedAgent())).pipe(toArray()));
      await firstValueFrom(runner.run(runRequest(retainedThread, 'run-retain', new CompletedAgent())).pipe(toArray()));
      runner.deleteThread(deletedThread);

      await expect(firstValueFrom(runner.connect({ threadId: deletedThread }).pipe(toArray()))).resolves.toEqual([]);
      await expect(firstValueFrom(runner.connect({ threadId: retainedThread }).pipe(toArray())))
        .resolves.toContainEqual(expect.objectContaining({ runId: 'run-retain' }));
    } finally {
      runner.close();
      await fixture.dispose();
    }
  });

  it('fails without a terminal event when completed history cannot be persisted, then releases its guard', async () => {
    const fixture = await createFixture();
    const runner = new SqliteAgentRunner({ dbPath: fixture.dbPath });
    const rejectingStore = new Database(fixture.dbPath);
    rejectingStore.exec(`
      CREATE TRIGGER reject_completed_history
      BEFORE INSERT ON agent_runs
      WHEN NEW.run_id = 'blocked-run-id'
      BEGIN
        SELECT RAISE(ABORT, 'raw SQLite storage detail');
      END;
    `);
    rejectingStore.close();
    const observedEvents: BaseEvent[] = [];

    try {
      const failedCompletion = new Promise<void>((resolve, reject) => {
        runner.run(runRequest('store-conflict', 'blocked-run-id', new CompletedAgent())).subscribe({
          next: (event) => observedEvents.push(event),
          error: reject,
          complete: resolve,
        });
      });
      const completionResult = failedCompletion.then(
        () => new Error('completed_without_persisted_history'),
        (error) => error,
      );

      await waitFor(async () => !(await runner.isRunning({ threadId: 'store-conflict' })));
      const failure = await completionResult;
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe('run_history_persistence_failed');
      expect(observedEvents.some((event) => event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR))
        .toBe(false);
      await expect(firstValueFrom(
        runner.run(runRequest('store-conflict', 'fresh-run-id', new CompletedAgent())).pipe(toArray()),
      )).resolves.toContainEqual(expect.objectContaining({ runId: 'fresh-run-id' }));
    } finally {
      runner.close();
      await fixture.dispose();
    }
  });
});

function runRequest(threadId: string, runId: string, agent: AbstractAgent) {
  return {
    threadId,
    agent,
    input: {
      threadId,
      runId,
      state: {},
      messages: [{ id: `user-${runId}`, role: 'user' as const, content: 'Run a characterization.' }],
    },
  };
}

function namespaceThread(organizationId: string, conversationId: string): string {
  return `${organizationId}\u0000${conversationId}`;
}

function activeConnectBridgeCount(runner: SqliteAgentRunner, threadId: string): number {
  const activeConnections = (runner as unknown as {
    activeConnections: Map<string, { subject: { observers: unknown[] } }>;
  }).activeConnections;
  return activeConnections.get(threadId)?.subject.observers.length ?? 0;
}

async function waitFor(predicate: () => Promise<boolean>, attempts = 100): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition_timed_out');
}

async function createFixture(): Promise<{ dbPath: string; dispose: () => Promise<void> }> {
  const directory = await mkdtemp(join(tmpdir(), 'kiditem-copilotkit-sqlite-'));
  return {
    dbPath: join(directory, 'events.sqlite'),
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}
