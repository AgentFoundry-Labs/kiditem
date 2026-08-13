import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CancelRequestAndRunInput,
  CreateRunRecordInput,
  FailClaimedRequestInput,
  FinalizeRunInput,
} from '../../../application/port/out/repository/agent-os-repository.port';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';
import type {
  AgentRunRecord,
  AgentRunRequestStatus,
} from '../../../domain/agent-os.types';
import { toRunRecord } from './agent-os.repository.mapper';

export class AgentOsRunLifecycleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRunForClaimedRequest(input: CreateRunRecordInput) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT request."id"
        FROM "agent_run_requests" request
        WHERE request."id" = ${input.requestId}::uuid
          AND request."organization_id" = ${input.organizationId}::uuid
          AND request."agent_instance_id" = ${input.agentInstanceId}::uuid
          AND request."task_session_id" = ${input.taskSessionId}::uuid
          AND request."status" = 'claimed'
        FOR UPDATE OF request
      `;
      if (claimed.length === 0) return null;

      const session = await tx.agentTaskSession.findFirst({
        where: {
          id: input.taskSessionId,
          organizationId: input.organizationId,
          agentInstanceId: input.agentInstanceId,
        },
        select: { taskKey: true },
      });
      if (!session) {
        throw new AgentOsBoundaryError(
          'agent_run_context_missing',
          'Cannot create AgentRun without its organization-scoped task session.',
        );
      }

      const row = await tx.agentRun.create({
        data: {
          organizationId: input.organizationId,
          agentInstanceId: input.agentInstanceId,
          requestId: input.requestId,
          taskSessionId: input.taskSessionId,
          attempt: input.attempt,
          invocationSource: input.invocationSource,
          adapterType: input.adapterType,
          model: input.model,
          taskKey: input.taskKey ?? session.taskKey,
          input: input.input as Prisma.InputJsonValue,
        },
      });
      return toRunRecord(row);
    });
  }

  async finalizeRun(input: FinalizeRunInput) {
    this.assertFinalizationDisposition(input);
    return this.prisma.$transaction(async (tx) => {
      const requests = await tx.$queryRaw<
        Array<{ id: string; status: AgentRunRequestStatus }>
      >`
        SELECT request."id", request."status"
        FROM "agent_run_requests" request
        WHERE request."id" = ${input.requestId}::uuid
          AND request."organization_id" = ${input.organizationId}::uuid
        FOR UPDATE OF request
      `;
      const request = requests[0];
      if (!request) {
        throw new AgentOsBoundaryError(
          'request_organization_mismatch',
          `AgentRunRequest ${input.requestId} does not belong to organization ${input.organizationId}.`,
        );
      }

      const runs = await tx.$queryRaw<AgentRunRecord[]>`
        SELECT
          run."id",
          run."organization_id" AS "organizationId",
          run."agent_instance_id" AS "agentInstanceId",
          run."request_id" AS "requestId",
          run."task_session_id" AS "taskSessionId",
          run."retry_of_run_id" AS "retryOfRunId",
          run."status",
          run."attempt",
          run."invocation_source" AS "invocationSource",
          run."adapter_type" AS "adapterType",
          run."model",
          run."provider",
          run."task_key" AS "taskKey",
          run."started_at" AS "startedAt",
          run."finished_at" AS "finishedAt",
          run."error_code" AS "errorCode",
          run."error_message" AS "errorMessage",
          run."output",
          run."last_event_seq" AS "lastEventSeq"
        FROM "agent_runs" run
        WHERE run."id" = ${input.runId}::uuid
          AND run."organization_id" = ${input.organizationId}::uuid
          AND run."request_id" = ${input.requestId}::uuid
        FOR UPDATE OF run
      `;
      const existing = runs[0];
      if (!existing) {
        throw new AgentOsBoundaryError(
          'run_organization_mismatch',
          `AgentRun ${input.runId} does not belong to organization ${input.organizationId}.`,
        );
      }

      const requestRequiresApproval = request.status === 'requires_approval';
      const mayFinalize =
        request.status === 'claimed' ||
        (requestRequiresApproval && input.status === 'succeeded');
      if (existing.status !== 'running' || !mayFinalize) {
        return {
          finalized: false,
          run: existing,
          requestStatus: request.status,
        };
      }

      const now = new Date();
      const runUpdate = await tx.agentRun.updateMany({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          requestId: input.requestId,
          status: 'running',
        },
        data: {
          status: input.status,
          output:
            input.output === undefined
              ? undefined
              : (input.output as Prisma.InputJsonValue),
          provider: input.provider ?? undefined,
          errorCode: input.errorCode ?? undefined,
          errorMessage: input.errorMessage ?? undefined,
          finishedAt: now,
        },
      });
      if (runUpdate.count !== 1) {
        throw new AgentOsBoundaryError(
          'run_finalization_conflict',
          `AgentRun ${input.runId} could not be finalized from running state.`,
        );
      }
      const run = await tx.agentRun.findFirstOrThrow({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          requestId: input.requestId,
        },
      });

      let requestStatus = request.status;
      if (!requestRequiresApproval) {
        requestStatus = input.nextRequestStatus;
        const requeue = requestStatus === 'pending';
        const requestUpdate = await tx.agentRunRequest.updateMany({
          where: {
            id: input.requestId,
            organizationId: input.organizationId,
            status: 'claimed',
          },
          data: {
            status: requestStatus,
            finishedAt: requeue ? null : now,
            claimedAt: requeue ? null : undefined,
            claimedBy: requeue ? null : undefined,
            lastErrorCode: input.errorCode ?? null,
            lastErrorMessage: input.errorMessage ?? null,
          },
        });
        if (requestUpdate.count !== 1) {
          throw new AgentOsBoundaryError(
            'request_finalization_conflict',
            `AgentRunRequest ${input.requestId} could not be finalized from claimed state.`,
          );
        }
      }

      if (input.cost) {
        await tx.agentCostEvent.create({
          data: {
            organizationId: input.organizationId,
            agentInstanceId: run.agentInstanceId,
            requestId: input.requestId,
            runId: input.runId,
            provider: input.cost.provider,
            model: input.cost.model,
            inputTokens: input.cost.inputTokens,
            outputTokens: input.cost.outputTokens,
            cachedInputTokens: input.cost.cachedInputTokens ?? 0,
            costMicros: input.cost.costMicros,
          },
        });
      }
      await tx.agentRuntimeState.update({
        where: { agentInstanceId: run.agentInstanceId },
        data: {
          totalRuns: { increment: 1 },
          ...(input.cost
            ? {
                totalInputTokens: { increment: input.cost.inputTokens },
                totalOutputTokens: { increment: input.cost.outputTokens },
                totalCostMicros: { increment: input.cost.costMicros },
              }
            : {}),
          lastRunId: input.runId,
          lastRunStatus: input.status,
          lastError: input.errorMessage ?? null,
          lastHeartbeatAt: now,
          consecutiveFailureCount:
            input.status === 'succeeded'
              ? 0
              : ({ increment: 1 } as unknown as number),
        },
      });

      return {
        finalized: true,
        run: toRunRecord(run),
        requestStatus,
      };
    });
  }

  async failClaimedRequest(input: FailClaimedRequestInput): Promise<boolean> {
    const changed = await this.prisma.agentRunRequest.updateMany({
      where: {
        id: input.requestId,
        organizationId: input.organizationId,
        status: 'claimed',
      },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        lastErrorCode: input.errorCode,
        lastErrorMessage: input.errorMessage,
      },
    });
    return changed.count === 1;
  }

  async cancelRequestAndRun(input: CancelRequestAndRunInput) {
    return this.prisma.$transaction(async (tx) => {
      const requests = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT request."id"
        FROM "agent_run_requests" request
        WHERE request."id" = ${input.requestId}::uuid
          AND request."organization_id" = ${input.organizationId}::uuid
          AND request."status" IN (${Prisma.join(input.currentRequestStatuses)})
        FOR UPDATE OF request
      `;
      if (requests.length === 0) return null;

      const expectedRunPredicate = input.expectedRunId
        ? Prisma.sql`AND run."id" = ${input.expectedRunId}::uuid`
        : Prisma.empty;
      const runningRuns = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT run."id"
        FROM "agent_runs" run
        WHERE run."request_id" = ${input.requestId}::uuid
          AND run."organization_id" = ${input.organizationId}::uuid
          AND run."status" = 'running'
          ${expectedRunPredicate}
        ORDER BY run."started_at" DESC, run."id" DESC
        LIMIT 1
        FOR UPDATE OF run
      `;
      const runningRunId = runningRuns[0]?.id ?? null;
      if (input.expectedRunId && !runningRunId) return null;

      const now = new Date();
      const requestUpdate = await tx.agentRunRequest.updateMany({
        where: {
          id: input.requestId,
          organizationId: input.organizationId,
          status: { in: input.currentRequestStatuses },
        },
        data: {
          status: 'cancelled',
          payload: input.payload as Prisma.InputJsonValue,
          finishedAt: now,
          lastErrorCode: input.errorCode,
          lastErrorMessage: input.errorMessage,
        },
      });
      if (requestUpdate.count !== 1) {
        throw new AgentOsBoundaryError(
          'request_cancellation_conflict',
          `AgentRunRequest ${input.requestId} could not be cancelled.`,
        );
      }

      if (!runningRunId) {
        return { requestId: input.requestId, run: null };
      }
      const runUpdate = await tx.agentRun.updateMany({
        where: {
          id: runningRunId,
          organizationId: input.organizationId,
          requestId: input.requestId,
          status: 'running',
        },
        data: {
          status: 'cancelled',
          finishedAt: now,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
        },
      });
      if (runUpdate.count !== 1) {
        throw new AgentOsBoundaryError(
          'run_cancellation_conflict',
          `AgentRun ${runningRunId} could not be cancelled.`,
        );
      }
      const run = await tx.agentRun.findFirstOrThrow({
        where: {
          id: runningRunId,
          organizationId: input.organizationId,
          requestId: input.requestId,
        },
      });
      return { requestId: input.requestId, run: toRunRecord(run) };
    });
  }

  async failInterruptedInlineRuns(input: {
    source: 'sourcing_dashboard';
    requestStatuses: ['pending', 'claimed', 'requires_approval'];
    createdBefore: Date;
    errorCode: 'process_interrupted';
    errorMessage: string;
    limit: 100;
  }): Promise<
    Array<{
      organizationId: string;
      requestId: string;
      runId: string | null;
      agentInstanceId: string;
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        organization_id: string;
        request_id: string;
        run_id: string | null;
        agent_instance_id: string;
      }>
    >`
      WITH candidates AS MATERIALIZED (
        SELECT req."id", req."organization_id", req."agent_instance_id", req."status"
        FROM "agent_run_requests" req
        WHERE req."source" = ${input.source}
          AND req."created_at" < ${input.createdBefore}
          AND (
            req."status" IN (${Prisma.join(input.requestStatuses)})
            OR EXISTS (
              SELECT 1
              FROM "agent_runs" active_run
              WHERE active_run."request_id" = req."id"
                AND active_run."organization_id" = req."organization_id"
                AND active_run."status" = 'running'
            )
          )
        ORDER BY req."created_at" ASC, req."id" ASC
        FOR UPDATE OF req SKIP LOCKED
        LIMIT ${input.limit}
      ),
      running_runs AS MATERIALIZED (
        SELECT run."id", run."request_id", run."organization_id"
        FROM "agent_runs" run
        INNER JOIN candidates
          ON candidates."id" = run."request_id"
          AND candidates."organization_id" = run."organization_id"
        WHERE run."status" = 'running'
        FOR UPDATE OF run
      ),
      closed_runs AS (
        UPDATE "agent_runs" run
        SET
          "status" = CASE
            WHEN candidates."status" = 'cancelled' THEN 'cancelled'
            ELSE 'failed'
          END,
          "finished_at" = ${input.createdBefore},
          "error_code" = CASE
            WHEN candidates."status" = 'cancelled' THEN 'user_cancelled'
            ELSE ${input.errorCode}
          END,
          "error_message" = CASE
            WHEN candidates."status" = 'cancelled' THEN 'User cancelled the request.'
            ELSE ${input.errorMessage}
          END
        FROM candidates, running_runs
        WHERE run."id" = running_runs."id"
          AND running_runs."request_id" = candidates."id"
          AND running_runs."organization_id" = candidates."organization_id"
        RETURNING run."request_id", run."organization_id", run."id"
      ),
      failed_requests AS (
        UPDATE "agent_run_requests" req
        SET
          "status" = 'failed',
          "finished_at" = ${input.createdBefore},
          "last_error_code" = ${input.errorCode},
          "last_error_message" = ${input.errorMessage},
          "updated_at" = ${input.createdBefore}
        FROM candidates
        WHERE req."id" = candidates."id"
          AND req."organization_id" = candidates."organization_id"
          AND req."status" IN (${Prisma.join(input.requestStatuses)})
        RETURNING req."id", req."organization_id", req."agent_instance_id"
      )
      SELECT
        candidates."organization_id",
        candidates."id" AS "request_id",
        (
          SELECT closed_runs."id"
          FROM closed_runs
          WHERE closed_runs."request_id" = candidates."id"
            AND closed_runs."organization_id" = candidates."organization_id"
          ORDER BY closed_runs."id"
          LIMIT 1
        ) AS "run_id",
        candidates."agent_instance_id"
      FROM candidates
      WHERE EXISTS (
        SELECT 1
        FROM failed_requests
        WHERE failed_requests."id" = candidates."id"
          AND failed_requests."organization_id" = candidates."organization_id"
      ) OR EXISTS (
        SELECT 1
        FROM closed_runs
        WHERE closed_runs."request_id" = candidates."id"
          AND closed_runs."organization_id" = candidates."organization_id"
      )
    `;
    return rows.map((row) => ({
      organizationId: row.organization_id,
      requestId: row.request_id,
      runId: row.run_id,
      agentInstanceId: row.agent_instance_id,
    }));
  }

  private assertFinalizationDisposition(input: FinalizeRunInput): void {
    const valid =
      (input.status === 'succeeded' &&
        input.nextRequestStatus === 'succeeded') ||
      (input.status === 'failed' &&
        (input.nextRequestStatus === 'failed' ||
          input.nextRequestStatus === 'pending'));
    if (valid) return;
    throw new AgentOsBoundaryError(
      'invalid_run_finalization',
      `AgentRun ${input.runId} has an invalid request disposition.`,
    );
  }
}
