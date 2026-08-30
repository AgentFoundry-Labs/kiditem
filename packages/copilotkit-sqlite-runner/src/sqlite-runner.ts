/*
 * Derived from @copilotkit/sqlite-runner@1.69.0.
 *
 * See ../UPSTREAM.md for provenance and the intentionally narrow KidItem
 * lifecycle/storage delta. The upstream compaction and replay algorithm is
 * preserved below.
 */
import {
  AgentRunner,
  finalizeRunEvents,
  type AgentRunnerConnectRequest,
  type AgentRunnerIsRunningRequest,
  type AgentRunnerRunRequest,
  type AgentRunnerStopRequest,
} from '@copilotkit/runtime/v2';
import { Observable, ReplaySubject } from 'rxjs';
import {
  type AbstractAgent,
  type BaseEvent,
  type RunAgentInput,
  EventType,
  type RunStartedEvent,
  compactEvents,
} from '@ag-ui/client';
import Database from 'better-sqlite3';

const SCHEMA_VERSION = 2;
const RUN_HISTORY_PERSISTENCE_ERROR = 'run_history_persistence_failed';

interface AgentRunRecord {
  id: number;
  thread_id: string;
  run_id: string;
  parent_run_id: string | null;
  events: BaseEvent[];
  input: RunAgentInput;
  created_at: number;
  version: number;
}

export interface SqliteAgentRunnerOptions {
  dbPath?: string;
}

interface ActiveConnectionContext {
  readonly runId: string;
  subject: ReplaySubject<BaseEvent>;
  agent?: AbstractAgent;
  runSubject?: ReplaySubject<BaseEvent>;
  currentEvents?: BaseEvent[];
  stopRequested?: boolean;
}

/**
 * API-process-local stream/stop context. It deliberately is not durable
 * execution authority: a new API process starts with an empty map and does not
 * resume provider work. Nest owns authenticated active-turn authority.
 */
export class SqliteAgentRunner extends AgentRunner {
  private readonly activeConnections = new Map<string, ActiveConnectionContext>();
  private readonly db: Database.Database;

  constructor(options: SqliteAgentRunnerOptions = {}) {
    super();
    this.db = new Database(options.dbPath ?? ':memory:');
    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Upstream persisted this as execution authority. Completed event history
    // is the only durable state in this fork, so remove any legacy lock during
    // boot instead of retaining a stale-running interpretation across restart.
    this.db.exec('DROP TABLE IF EXISTS run_state');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        parent_run_id TEXT,
        events TEXT NOT NULL,
        input TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        version INTEGER NOT NULL,
        UNIQUE(thread_id, run_id)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);

    const currentVersion = this.db
      .prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
      .get() as { version: number } | undefined;

    if (currentVersion && currentVersion.version < SCHEMA_VERSION) {
      this.migrateRunIdUniqueness();
    }

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_thread_id ON agent_runs(thread_id);
      CREATE INDEX IF NOT EXISTS idx_parent_run_id ON agent_runs(parent_run_id);
    `);

    if (!currentVersion || currentVersion.version < SCHEMA_VERSION) {
      this.db
        .prepare('INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)')
        .run(SCHEMA_VERSION, Date.now());
    }
  }

  private migrateRunIdUniqueness(): void {
    this.db.transaction(() => {
      this.db.exec(`
        DROP INDEX IF EXISTS idx_thread_id;
        DROP INDEX IF EXISTS idx_parent_run_id;
        ALTER TABLE agent_runs RENAME TO agent_runs_legacy;
        CREATE TABLE agent_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          thread_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          parent_run_id TEXT,
          events TEXT NOT NULL,
          input TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          version INTEGER NOT NULL,
          UNIQUE(thread_id, run_id)
        );
        INSERT INTO agent_runs (
          id, thread_id, run_id, parent_run_id, events, input, created_at, version
        )
        SELECT id, thread_id, run_id, parent_run_id, events, input, created_at, version
        FROM agent_runs_legacy;
        DROP TABLE agent_runs_legacy;
      `);
    })();
  }

  private storeRun(
    threadId: string,
    runId: string,
    events: BaseEvent[],
    input: RunAgentInput,
    parentRunId?: string | null,
  ): void {
    const compactedEvents = compactEvents(events);
    this.db.prepare(`
      INSERT INTO agent_runs (thread_id, run_id, parent_run_id, events, input, created_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      threadId,
      runId,
      parentRunId ?? null,
      JSON.stringify(compactedEvents),
      JSON.stringify(input),
      Date.now(),
      SCHEMA_VERSION,
    );
  }

  private getHistoricRuns(threadId: string): AgentRunRecord[] {
    const rows = this.db.prepare(`
      WITH RECURSIVE run_chain AS (
        SELECT * FROM agent_runs
        WHERE thread_id = ? AND parent_run_id IS NULL

        UNION ALL

        SELECT ar.* FROM agent_runs ar
        INNER JOIN run_chain rc ON ar.parent_run_id = rc.run_id
        WHERE ar.thread_id = ?
      )
      SELECT * FROM run_chain
      ORDER BY created_at ASC
    `).all(threadId, threadId) as Array<Omit<AgentRunRecord, 'events' | 'input'> & {
      events: string;
      input: string;
    }>;

    return rows.map((row) => ({
      ...row,
      events: JSON.parse(row.events) as BaseEvent[],
      input: JSON.parse(row.input) as RunAgentInput,
    }));
  }

  private getLatestRunId(threadId: string): string | null {
    const result = this.db
      .prepare('SELECT run_id FROM agent_runs WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(threadId) as { run_id: string } | undefined;
    return result?.run_id ?? null;
  }

  run(request: AgentRunnerRunRequest): Observable<BaseEvent> {
    if (this.activeConnections.has(request.threadId)) {
      throw new Error('Thread already running');
    }

    const seenMessageIds = new Set<string>();
    const currentRunEvents: BaseEvent[] = [];
    const historicMessageIds = historicMessageIdsFor(this.getHistoricRuns(request.threadId));
    const connectionSubject = new ReplaySubject<BaseEvent>(Infinity);
    const runSubject = new ReplaySubject<BaseEvent>(Infinity);
    const connection: ActiveConnectionContext = {
      runId: request.input.runId,
      subject: connectionSubject,
      agent: request.agent,
      runSubject,
      currentEvents: currentRunEvents,
      stopRequested: false,
    };
    this.activeConnections.set(request.threadId, connection);

    const releaseRun = (): void => {
      if (this.activeConnections.get(request.threadId) === connection) {
        this.activeConnections.delete(request.threadId);
      }
      connection.agent = undefined;
      connection.runSubject = undefined;
      connection.currentEvents = undefined;
      connection.stopRequested = false;
    };

    const completeRun = (): void => {
      releaseRun();
      runSubject.complete();
      connectionSubject.complete();
    };

    const failRun = (): void => {
      releaseRun();
      const error = new Error(RUN_HISTORY_PERSISTENCE_ERROR);
      runSubject.error(error);
      connectionSubject.error(error);
    };

    const pendingTerminalEvents: BaseEvent[] = [];
    const emitEvent = (event: BaseEvent): void => {
      if (event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR) {
        pendingTerminalEvents.push(event);
        return;
      }
      runSubject.next(event);
      connectionSubject.next(event);
    };

    const finalizeEvents = (): void => {
      const appendedEvents = finalizeRunEvents(currentRunEvents, {
        stopRequested: connection.stopRequested ?? false,
      });
      for (const event of appendedEvents) {
        emitEvent(event);
      }
    };

    const emitTerminalEvents = (): void => {
      for (const event of pendingTerminalEvents) {
        runSubject.next(event);
        connectionSubject.next(event);
      }
    };

    const runAgent = async (): Promise<void> => {
      let parentRunId: string | null = null;
      try {
        parentRunId = this.getLatestRunId(request.threadId);
        await request.agent.runAgent(request.input, {
          onEvent: ({ event }) => {
            const processedEvent = normalizeRunStartedInput(event, request.input, historicMessageIds);
            currentRunEvents.push(processedEvent);
            emitEvent(processedEvent);
          },
          onNewMessage: ({ message }) => {
            seenMessageIds.add(message.id);
          },
          onRunStartedEvent: () => {
            for (const message of request.input.messages ?? []) {
              seenMessageIds.add(message.id);
            }
          },
        });
      } catch {
        // A terminal stream is still emitted below. Do not surface provider or
        // SQLite internals through this public event transport.
      } finally {
        try {
          finalizeEvents();
          if (currentRunEvents.length > 0) {
            this.storeRun(
              request.threadId,
              request.input.runId,
              currentRunEvents,
              request.input,
              parentRunId,
            );
          }
          emitTerminalEvents();
          completeRun();
        } catch {
          // A terminal event is observable only after durable storage commits.
          // Do not leak driver details, but always release the local guard.
          failRun();
        }
      }
    };

    void runAgent();
    return runSubject.asObservable();
  }

  connect(request: AgentRunnerConnectRequest): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const connectionSubject = new ReplaySubject<BaseEvent>(Infinity);
      const allHistoricEvents = this.getHistoricRuns(request.threadId)
        .flatMap((run) => run.events);
      const compactedEvents = compactEvents(allHistoricEvents);
      const emittedMessageIds = new Set<string>();
      for (const event of compactedEvents) {
        connectionSubject.next(event);
        if ('messageId' in event && typeof event.messageId === 'string') {
          emittedMessageIds.add(event.messageId);
        }
      }

      const activeConnection = this.activeConnections.get(request.threadId);
      const activeBridge = activeConnection?.subject.subscribe({
        next: (event) => {
          if (
            'messageId' in event
            && typeof event.messageId === 'string'
            && emittedMessageIds.has(event.messageId)
          ) {
            return;
          }
          connectionSubject.next(event);
        },
        complete: () => connectionSubject.complete(),
        error: (error) => connectionSubject.error(error),
      });
      if (!activeConnection) connectionSubject.complete();

      const connectionSubscription = connectionSubject.subscribe(subscriber);
      return () => {
        activeBridge?.unsubscribe();
        connectionSubscription.unsubscribe();
      };
    });
  }

  isRunning(request: AgentRunnerIsRunningRequest): Promise<boolean> {
    return Promise.resolve(this.activeConnections.has(request.threadId));
  }

  stop(request: AgentRunnerStopRequest): Promise<boolean> {
    const connection = this.activeConnections.get(request.threadId);
    if (!connection || !connection.agent) return Promise.resolve(false);
    if (request.runId && request.runId !== connection.runId) return Promise.resolve(false);
    if (connection.stopRequested) return Promise.resolve(false);

    connection.stopRequested = true;
    try {
      connection.agent.abortRun();
      return Promise.resolve(true);
    } catch {
      connection.stopRequested = false;
      return Promise.resolve(false);
    }
  }

  /** Remove one exact, already-terminal event-history chain transactionally. */
  deleteThread(threadId: string): void {
    if (this.activeConnections.has(threadId)) {
      throw new Error('Thread already running');
    }
    this.db.transaction((targetThreadId: string) => {
      this.db.prepare('DELETE FROM agent_runs WHERE thread_id = ?').run(targetThreadId);
    })(threadId);
  }

  close(): void {
    this.db.close();
  }
}

function historicMessageIdsFor(runs: AgentRunRecord[]): Set<string> {
  const messageIds = new Set<string>();
  for (const run of runs) {
    for (const event of run.events) {
      if ('messageId' in event && typeof event.messageId === 'string') {
        messageIds.add(event.messageId);
      }
      if (event.type === EventType.RUN_STARTED) {
        const messages = (event as RunStartedEvent).input?.messages ?? [];
        for (const message of messages) messageIds.add(message.id);
      }
    }
  }
  return messageIds;
}

function normalizeRunStartedInput(
  event: BaseEvent,
  input: RunAgentInput,
  historicMessageIds: Set<string>,
): BaseEvent {
  if (event.type !== EventType.RUN_STARTED || (event as RunStartedEvent).input) {
    return event;
  }
  const messages = input.messages?.filter((message) => !historicMessageIds.has(message.id));
  return {
    ...(event as RunStartedEvent),
    input: {
      ...input,
      ...(messages === undefined ? {} : { messages }),
    },
  } as RunStartedEvent;
}
