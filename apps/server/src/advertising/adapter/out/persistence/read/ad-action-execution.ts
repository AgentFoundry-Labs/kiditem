import type { Prisma } from '@prisma/client';
import { AD_ACTION_KIND, AdActionProviderOutcomeSchema } from '@kiditem/shared/advertising-operations';
import type { AdActionExecuteStatus, AdActionExecution } from '@kiditem/shared/advertising';
import { readOperationsByPlan, type OperationByPlanRow } from '../../../../../common/operation/transaction/operations-by-plan';

export type { AdActionExecution };

/**
 * An AdAction's execution word comes from its `advertising.ad_action`
 * operation (KID-386); the action keeps only the link (`operationId`) and an
 * audit copy in `payload.execution`. This module states the mapping once.
 *
 * - No `operationId`: `not_prepared`.
 * - `prepared` → `queued`, `executing` → `running`, `succeeded` → `done`, or
 *   `uncertain` when the run's result says the ad center showed no campaign id,
 *   `failed` → `failed`, `cancelled` → `cancelled`. A lease that ran out reads
 *   as the operation contract projects it (`readOperationsByPlan`).
 */
const EXECUTE_STATUS_BY_OPERATION_STATUS: Readonly<Record<string, AdActionExecuteStatus>> = {
  prepared: 'queued',
  executing: 'running',
  reconciling: 'running',
  succeeded: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
};

/** The operation contract's code for a run closed because its lease ran out. */
const LEASE_EXPIRED_ERROR_CODE = 'OPERATION_FENCE_LOST';
const LEASE_EXPIRED_MESSAGE = '실행 기한(10분)이 지나 결과를 받지 못했습니다. 광고센터에서 캠페인이 만들어졌는지 확인해 주세요.';

export const NOT_PREPARED_EXECUTION: AdActionExecution = {
  operationId: null,
  executeStatus: 'not_prepared',
  providerOutcome: null,
  campaignId: null,
  errorCode: null,
  errorMessage: null,
  executedAt: null,
};

export function deriveAdActionExecution(
  operationId: string | null,
  operation: OperationByPlanRow | null,
): AdActionExecution {
  if (!operationId || !operation) return NOT_PREPARED_EXECUTION;
  const result = (operation.result && typeof operation.result === 'object' && !Array.isArray(operation.result)
    ? operation.result
    : {}) as Record<string, unknown>;
  const outcome = AdActionProviderOutcomeSchema.safeParse(result.providerOutcome);
  const providerOutcome = operation.status === 'succeeded' && outcome.success ? outcome.data : null;
  const mapped = EXECUTE_STATUS_BY_OPERATION_STATUS[operation.status] ?? 'failed';
  const executeStatus: AdActionExecuteStatus = mapped === 'done' && providerOutcome === 'uncertain' ? 'uncertain' : mapped;
  const failed = executeStatus === 'failed';
  return {
    operationId: operation.id,
    executeStatus,
    providerOutcome,
    campaignId: providerOutcome && typeof result.campaignId === 'string' ? result.campaignId : null,
    errorCode: failed ? operation.errorCode : null,
    errorMessage: failed
      ? (operation.errorCode === LEASE_EXPIRED_ERROR_CODE ? LEASE_EXPIRED_MESSAGE : operation.errorMessage)
      : null,
    executedAt: operation.status === 'succeeded' ? operation.finishedAt : null,
  };
}

/**
 * The execution of each named action, keyed by action id. Only actions with an
 * `operationId` are looked up; the rest read `not_prepared`. Runs on the
 * caller's client (a transaction or PrismaService).
 */
export async function readAdActionExecutions(
  client: Prisma.TransactionClient,
  input: { organizationId: string; actions: ReadonlyArray<{ id: string; operationId: string | null }> },
): Promise<Map<string, AdActionExecution>> {
  const linked = input.actions.filter((action) => action.operationId !== null);
  const latest = linked.length === 0
    ? []
    : await readOperationsByPlan(client, {
      organizationId: input.organizationId,
      kinds: [AD_ACTION_KIND],
      planContainsAny: linked.map((action) => ({ actionId: action.id })),
      latestPer: 'actionId',
      plan: { payloadKeys: [] },
    });
  const byAction = new Map(latest.map((row) => [String((row.plan as { actionId?: unknown } | null)?.actionId), row]));
  return new Map(input.actions.map((action) => [
    action.id,
    deriveAdActionExecution(action.operationId, action.operationId ? byAction.get(action.id) ?? null : null),
  ]));
}
