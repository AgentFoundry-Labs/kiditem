import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { scrubDeep } from '@kiditem/shared/security';
import type { AgentTrace, AgentTaskListResponse, AgentWakeupRequest } from '@kiditem/shared/agent-trace';
import { PrismaService } from '../../prisma/prisma.service';
import type { TraceQueryDto, TraceListQueryDto } from './dto';

/**
 * AgentTraceService — task → wakeup → run → event 2-hop JSONB 역추적.
 *
 * 역추적 경로:
 *   AgentTask.id
 *     → AgentWakeupRequest.payload->>'_legacy_task_id' 매칭 (legacy marker 경유)
 *     → wakeupRequests[].runId
 *     → HeartbeatRun + AgentEvent (runId IN) 조회
 *
 * 규약:
 *   - 모든 where 절에 companyId 포함 (ADR-0006)
 *   - `$queryRaw` tagged template 만 사용 — `$queryRawUnsafe` 금지 (ADR-0009)
 *   - 응답 직렬화 직전 scrubDeep 방어 (ADR-0007 read-time)
 *   - task marker 미검출 시 traceability.warning 으로 legacy 상태 고지
 */
@Injectable()
export class AgentTraceService {
  /** runId 페이징 상한 — 1 tick 의 IN 쿼리를 제한. 초과 시 cursor 로 이어서. */
  private static readonly PAGE_LIMIT = 100;
  /** event 조회 상한 — 운영상 1 run 당 수 백 건이 정상, 2000 초과는 비정상. */
  private static readonly EVENT_TAKE = 2000;

  constructor(private readonly prisma: PrismaService) {}

  // ── Task 목록 ──
  async listTasks(companyId: string, q: TraceListQueryDto): Promise<AgentTaskListResponse> {
    const page = q.page ?? 1;
    const limit = Math.min(q.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.AgentTaskWhereInput = { companyId };
    if (q.status) where.status = q.status;
    if (q.agentType) where.agentType = q.agentType;
    if (q.from || q.to) {
      const range: { gte?: Date; lte?: Date } = {};
      if (q.from) range.gte = new Date(q.from);
      if (q.to) range.lte = new Date(q.to);
      where.createdAt = range;
    }

    const [items, total] = await Promise.all([
      this.prisma.agentTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.agentTask.count({ where }),
    ]);

    const response = { items, total, page, limit } satisfies AgentTaskListResponse;
    return scrubDeep(response);
  }

  // ── Trace 상세 ──
  async getTrace(taskId: string, companyId: string, q: TraceQueryDto): Promise<AgentTrace> {
    // 1. task (companyId 격리 — findFirst 로 cross-tenant 차단)
    const task = await this.prisma.agentTask.findFirst({
      where: { id: taskId, companyId },
    });
    if (!task) throw new NotFoundException('task_not_found');

    // 2. wakeupRequests — JSONB marker 매칭. tagged template + cast 로 binding 안전.
    const rawRows = await this.prisma.$queryRaw<AgentWakeupRequestRow[]>`
      SELECT
        id, company_id, agent_id, source, trigger_detail, reason, payload,
        status, coalesced_count, requested_by_type, requested_by_id, run_id,
        requested_at, claimed_at, finished_at, error, created_at, updated_at
      FROM agent_wakeup_requests
      WHERE company_id = ${companyId}::uuid
        AND payload->>'_legacy_task_id' = ${taskId}
      ORDER BY requested_at ASC
    `;
    const wakeupRequests = rawRows.map(mapWakeupRow);

    // 3. runId 수집 + 커서 슬라이스
    const runIds = Array.from(
      new Set(wakeupRequests.map((w) => w.runId).filter((id): id is string => !!id)),
    );

    const cursor = q.cursor ? parseInt(q.cursor, 10) : 0;
    const safeCursor = Number.isFinite(cursor) && cursor >= 0 ? cursor : 0;
    const slicedRunIds = runIds.slice(safeCursor, safeCursor + AgentTraceService.PAGE_LIMIT);
    const hasMore = runIds.length > safeCursor + AgentTraceService.PAGE_LIMIT;

    // 4. heartbeatRuns — runId IN + companyId 이중 방어
    const heartbeatRuns = slicedRunIds.length
      ? await this.prisma.heartbeatRun.findMany({
          where: { id: { in: slicedRunIds }, companyId },
          orderBy: { startedAt: 'asc' },
        })
      : [];

    // 5. events — runId IN + companyId. take 2000 상한
    const events = slicedRunIds.length
      ? await this.prisma.agentEvent.findMany({
          where: { runId: { in: slicedRunIds }, companyId },
          orderBy: [{ runId: 'asc' }, { createdAt: 'asc' }],
          take: AgentTraceService.EVENT_TAKE,
        })
      : [];

    // 6. workflowRun — task 에 연결된 것만
    const workflowRun = task.workflowRunId
      ? await this.prisma.workflowRun.findUnique({ where: { id: task.workflowRunId } })
      : null;

    // 7. logs — taskId 기준 (companyId 이중 조건 없음: AgentLog 는 taskId 전용 FK)
    const logs = await this.prisma.agentLog.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });

    // 8. traceability 판단
    const markerFound = wakeupRequests.length > 0;
    const creationPath: 'workflow' | 'direct' | 'unknown' = task.workflowRunId
      ? 'workflow'
      : markerFound
        ? 'direct'
        : 'unknown';
    const warning = markerFound
      ? null
      : '이 태스크의 실행 추적 마커(_legacy_task_id)가 누락되어 트레이스를 복원할 수 없습니다. 새로운 태스크는 정상 추적됩니다.';

    // 9. 응답 조립 + scrubDeep read-time 방어 (ADR-0007)
    // satisfies 미적용: WorkflowRun/HeartbeatRun.status 는 Prisma String 이지만 shared 스키마는
    // z.enum([...]) 로 좁혀져 있어 Prisma 직접 반환 시 드리프트. enum narrowing 은 업스트림 스키마
    // 수정 없이 서비스 레벨에서 안전하게 해결 불가 (packages/shared 수정 금지).
    const response = {
      task,
      workflowRun,
      heartbeatRuns,
      wakeupRequests,
      events,
      logs,
      traceability: { markerFound, creationPath, warning },
      pagination: {
        hasMore,
        nextCursor: hasMore ? String(safeCursor + AgentTraceService.PAGE_LIMIT) : null,
      },
    };

    return scrubDeep(response as unknown as AgentTrace);
  }
}

// ── 내부 타입: $queryRaw snake_case 로우 → camelCase 매핑 ──

interface AgentWakeupRequestRow {
  id: string;
  company_id: string;
  agent_id: string;
  source: string;
  trigger_detail: string | null;
  reason: string | null;
  payload: unknown;
  status: string;
  coalesced_count: number;
  requested_by_type: string | null;
  requested_by_id: string | null;
  run_id: string | null;
  requested_at: Date;
  claimed_at: Date | null;
  finished_at: Date | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapWakeupRow(r: AgentWakeupRequestRow): AgentWakeupRequest {
  return {
    id: r.id,
    companyId: r.company_id,
    agentId: r.agent_id,
    source: r.source,
    triggerDetail: r.trigger_detail,
    reason: r.reason,
    payload: r.payload,
    status: r.status,
    coalescedCount: Number(r.coalesced_count),
    requestedByType: r.requested_by_type,
    requestedById: r.requested_by_id,
    runId: r.run_id,
    requestedAt: r.requested_at,
    claimedAt: r.claimed_at,
    finishedAt: r.finished_at,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  } as AgentWakeupRequest;
}
