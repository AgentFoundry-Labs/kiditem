// Outgoing port for the ad-action execution runtime: `ExecutionWorker`,
// `ExecutionTask`, `ExecutionLog`. The application service composes
// orchestration around these contracts so Prisma + transaction details
// stay behind the adapter boundary.

export const AD_EXECUTION_REPOSITORY_PORT = Symbol(
  'AdExecutionRepositoryPort',
);

export const DEFAULT_LEASE_LIMIT = 3;
export const MAX_LEASE_LIMIT = 10;

export interface LeaseOptions {
  label?: string;
  pageType?: string;
  limit?: number;
}

export interface LeasedExecutionTask {
  actionId: string;
  taskId: string;
  actionType: string;
  targetType: string;
  targetLabel: string;
  targetRef: string;
  priority: string;
  executionMode: 'browser';
  payload: Record<string, unknown>;
}

export interface ScopedExecutionTaskRow {
  id: string;
  actionId: string;
  status: string;
  workerId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  attempt: number;
  beforeJson: unknown;
  afterJson: unknown;
  screenshotPath: string | null;
  errorMessage: string | null;
  action: {
    organizationId: string;
    actionType: string;
    targetType: string;
    targetLabel: string;
    externalId: string | null;
    priority: string;
    payload: unknown;
    beforeJson: unknown;
    afterJson: unknown;
    errorMessage: string | null;
  };
}

export interface ExecutionReportInput {
  taskId: string;
  workerKey: string;
  status: 'running' | 'done' | 'failed';
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  errorMessage?: string;
  screenshotPath?: string;
  logs?: Array<{
    level?: string;
    step: string;
    message: string;
    payload?: Record<string, unknown>;
  }>;
}

export interface WorkerHeartbeatMeta {
  currentUrl?: string;
  currentPageType?: string;
}

export interface AdExecutionRepositoryPort {
  upsertWorkerForLease(
    workerKey: string,
    options: LeaseOptions | undefined,
    organizationId: string,
  ): Promise<{ id: string; workerKey: string }>;

  leaseQueuedTasks(
    worker: { id: string; workerKey: string },
    requestedPageType: string,
    limit: number,
    organizationId: string,
  ): Promise<LeasedExecutionTask[]>;

  heartbeatWorkerOrThrow(
    workerKey: string,
    meta: WorkerHeartbeatMeta | undefined,
    organizationId: string,
  ): Promise<void>;

  findScopedExecutionTask(
    taskId: string,
    organizationId: string,
  ): Promise<ScopedExecutionTaskRow | null>;

  findTaskWorkerKey(
    workerId: string,
    organizationId: string,
  ): Promise<string | null>;

  /**
   * Persist worker-reported task transition with the matching AdAction
   * state change inside a single $transaction (adapter-owned).
   * Throws `NotFoundException` when any tenant-scoped write becomes a no-op.
   */
  reportExecutionTask(
    body: ExecutionReportInput,
    task: ScopedExecutionTaskRow,
    organizationId: string,
  ): Promise<void>;
}
