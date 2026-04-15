import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AgentTaskListResponse, AgentTrace } from '@kiditem/shared';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AgentTraceService } from './agent-trace.service';
import { TraceListQueryDto, TraceParamsDto, TraceQueryDto } from './dto';

/**
 * AgentTrace 관측 엔드포인트.
 *
 * - ADR-0006: `@CurrentCompany()` 로만 companyId 주입. 쿼리/바디 companyId 금지.
 * - ADR-0008: admin/owner 전용 (운영 역할 ops 는 별 Phase).
 * - Phase 0.3: `@Throttle` 로 관측 계열 burst 제한 (30 req/min).
 *
 * 라우트:
 *   GET /api/agent-trace              — task 목록 (필터 + pagination)
 *   GET /api/agent-trace/:id          — 단일 trace (task → wakeup → run → event)
 *
 * Prefix 변천:
 *   v1: `agent-registry/tasks` — AgentRegistryController `:id` 가 `tasks` 를
 *       UUID 로 파싱 시도해 500.
 *   v2: `agent-tasks` — companies/agent-tasks.controller.ts 가 동일 prefix 선점.
 *   v3: `agent-trace` — 독립 resource, 충돌 없음.
 */
@Controller('agent-trace')
@Roles('owner', 'admin')
export class AgentTraceController {
  constructor(private readonly svc: AgentTraceService) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  list(
    @CurrentCompany() companyId: string,
    @Query() q: TraceListQueryDto,
  ): Promise<AgentTaskListResponse> {
    return this.svc.listTasks(companyId, q);
  }

  @Get(':id')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  trace(
    @Param() params: TraceParamsDto,
    @CurrentCompany() companyId: string,
    @Query() q: TraceQueryDto,
  ): Promise<AgentTrace> {
    return this.svc.getTrace(params.id, companyId, q);
  }
}
