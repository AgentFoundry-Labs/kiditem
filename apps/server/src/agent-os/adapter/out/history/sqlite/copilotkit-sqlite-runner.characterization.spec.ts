import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AbstractAgent,
  EventType,
  type BaseEvent,
  type RunAgentInput,
} from '@ag-ui/client';
import { SqliteAgentRunner } from '@copilotkit/sqlite-runner';
import { EMPTY, firstValueFrom, type Observable } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { describe, expect, it } from 'vitest';

type AgentCallbacks = {
  onEvent: (input: { event: BaseEvent }) => Promise<void> | void;
  onRunStartedEvent?: () => Promise<void> | void;
};

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

type ThreadDeletableRunner = SqliteAgentRunner & {
  deleteThread?: (threadId: string) => Promise<void> | void;
};

class ControlledTerminalAgent extends AbstractAgent {
  private readonly startedDeferred = deferred();
  private readonly finishDeferred = deferred();
  abortCalls = 0;

  async runAgent(input: RunAgentInput, callbacks: AgentCallbacks): Promise<void> {
    await callbacks.onEvent({
      event: {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
    });
    await callbacks.onRunStartedEvent?.();
    this.startedDeferred.resolve();
    await this.finishDeferred.promise;
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
    return this.startedDeferred.promise;
  }

  finish(): void {
    this.finishDeferred.resolve();
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
      event: {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
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

describe('upstream @copilotkit/sqlite-runner 1.69.0 characterization', () => {
  it('keeps a run alive and persists its terminal event after the original subscriber leaves', async () => {
    const fixture = await createFixture();
    const threadId = 'subscriber-departure';
    const runId = 'run-subscriber-departure';
    const agent = new ControlledTerminalAgent();
    const runner = new SqliteAgentRunner({ dbPath: fixture.dbPath });

    try {
      const subscription = runner.run(runRequest(threadId, runId, agent)).subscribe();
      await agent.waitForStart();
      subscription.unsubscribe();

      agent.finish();
      await waitFor(async () => !(await runner.isRunning({ threadId })));

      const replay = await firstValueFrom(runner.connect({ threadId }).pipe(toArray()));
      expect(replay.at(-1)).toMatchObject({
        type: EventType.RUN_FINISHED,
        threadId,
        runId,
      });
    } finally {
      runner.close();
      await fixture.dispose();
    }
  });

  it.fails('does not retain a durable running lock after process reconstruction', async () => {
    const fixture = await createFixture();
    const threadId = 'restart-stale-lock';
    const child = spawnStalledRunner(fixture.dbPath, threadId, 'run-before-restart');

    try {
      await waitForChildOutput(child, 'started');
      await terminateChild(child);

      const reconstructed = new SqliteAgentRunner({ dbPath: fixture.dbPath });
      try {
        await expect(reconstructed.isRunning({ threadId })).resolves.toBe(false);
        await firstValueFrom(
          reconstructed
            .run(runRequest(threadId, 'run-after-restart', new CompletedAgent()))
            .pipe(toArray()),
        );
      } finally {
        reconstructed.close();
      }
    } finally {
      await terminateChild(child);
      await fixture.dispose();
    }
  });

  it.fails('rejects a stale stop runId without aborting the active run', async () => {
    const fixture = await createFixture();
    const threadId = 'exact-stop-run-id';
    const runId = 'run-active';
    const agent = new ControlledTerminalAgent();
    const runner = new SqliteAgentRunner({ dbPath: fixture.dbPath });
    const completion = firstValueFrom(
      runner.run(runRequest(threadId, runId, agent)).pipe(toArray()),
    );

    try {
      await agent.waitForStart();

      await expect(runner.stop({ threadId, runId: 'run-stale' })).resolves.toBe(false);
      expect(agent.abortCalls).toBe(0);
      await expect(runner.isRunning({ threadId })).resolves.toBe(true);
    } finally {
      agent.finish();
      await completion;
      runner.close();
      await fixture.dispose();
    }
  });

  it.fails('keeps the matching run active after an interrupt acknowledgement until its terminal event', async () => {
    const fixture = await createFixture();
    const threadId = 'exact-stop-terminal';
    const runId = 'run-active';
    const agent = new ControlledTerminalAgent();
    const runner = new SqliteAgentRunner({ dbPath: fixture.dbPath });
    const completion = firstValueFrom(
      runner.run(runRequest(threadId, runId, agent)).pipe(toArray()),
    );

    try {
      await agent.waitForStart();

      await expect(runner.stop({ threadId, runId })).resolves.toBe(true);
      expect(agent.abortCalls).toBe(1);
      await expect(runner.isRunning({ threadId })).resolves.toBe(true);

      agent.finish();
      await completion;
      await expect(runner.isRunning({ threadId })).resolves.toBe(false);
    } finally {
      agent.finish();
      await completion;
      runner.close();
      await fixture.dispose();
    }
  });

  it('isolates the same public conversation ID in distinct organization namespaces', async () => {
    const fixture = await createFixture();
    const runner = new SqliteAgentRunner({ dbPath: fixture.dbPath });
    const conversationId = 'same-public-conversation';
    const firstThread = namespaceThread('organization-a', conversationId);
    const secondThread = namespaceThread('organization-b', conversationId);

    try {
      await firstValueFrom(
        runner
          .run(runRequest(firstThread, 'run-organization-a', new CompletedAgent()))
          .pipe(toArray()),
      );

      await expect(firstValueFrom(runner.connect({ threadId: secondThread }).pipe(toArray())))
        .resolves.toEqual([]);
    } finally {
      runner.close();
      await fixture.dispose();
    }
  });

  it.fails('deletes one exact namespaced thread without touching another completed event chain', async () => {
    const fixture = await createFixture();
    const runner = new SqliteAgentRunner({ dbPath: fixture.dbPath }) as ThreadDeletableRunner;
    const deletedThread = namespaceThread('organization-a', 'conversation-delete');
    const retainedThread = namespaceThread('organization-a', 'conversation-retain');

    try {
      expect(typeof runner.deleteThread).toBe('function');
      if (typeof runner.deleteThread !== 'function') return;

      await firstValueFrom(
        runner
          .run(runRequest(deletedThread, 'run-delete', new CompletedAgent()))
          .pipe(toArray()),
      );
      await firstValueFrom(
        runner
          .run(runRequest(retainedThread, 'run-retain', new CompletedAgent()))
          .pipe(toArray()),
      );

      await runner.deleteThread(deletedThread);

      await expect(firstValueFrom(runner.connect({ threadId: deletedThread }).pipe(toArray())))
        .resolves.toEqual([]);
      await expect(firstValueFrom(runner.connect({ threadId: retainedThread }).pipe(toArray())))
        .resolves.toContainEqual(expect.objectContaining({
          type: EventType.RUN_FINISHED,
          threadId: retainedThread,
          runId: 'run-retain',
        }));
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
      messages: [{ id: `user-${runId}`, role: 'user' as const, content: 'Characterize the runner.' }],
    },
  };
}

function namespaceThread(organizationId: string, conversationId: string): string {
  return `${organizationId}\u0000${conversationId}`;
}

function deferred(): Deferred {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve: () => resolve?.() };
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

function spawnStalledRunner(dbPath: string, threadId: string, runId: string): ChildProcess {
  const script = `
    const { AbstractAgent, EventType } = require('@ag-ui/client');
    const { SqliteAgentRunner } = require('@copilotkit/sqlite-runner');
    const { EMPTY } = require('rxjs');
    class StalledAgent extends AbstractAgent {
      async runAgent(input, callbacks) {
        await callbacks.onEvent({ event: { type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId } });
        await callbacks.onRunStartedEvent?.();
        process.stdout.write('started\\n');
        await new Promise(() => {});
      }
      run() { return EMPTY; }
      connect() { return EMPTY; }
      clone() { return new StalledAgent(); }
    }
    const [dbPath, threadId, runId] = process.argv.slice(1);
    const runner = new SqliteAgentRunner({ dbPath });
    runner.run({
      threadId,
      agent: new StalledAgent(),
      input: { threadId, runId, state: {}, messages: [] },
    }).subscribe();
  `;
  return spawn(process.execPath, ['-e', script, dbPath, threadId, runId], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForChildOutput(child: ChildProcess, expected: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let output = '';
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(expected)) {
        cleanup();
        resolve();
      }
    };
    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`stalled_runner_exited_${code ?? 'signal'}`));
    };
    const cleanup = () => {
      child.stdout?.off('data', onData);
      child.off('exit', onExit);
    };
    child.stdout?.on('data', onData);
    child.once('exit', onExit);
  });
}

async function terminateChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGKILL');
  });
}
