import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import {
  AgentStatusChangedEvent,
  AgentBudgetWarningEvent,
  AgentAutoPausedEvent,
  AGENT_EVENTS,
} from './agent-events';

/**
 * Internal SSE payload — `companyId` 는 라우팅 전용이며 구독자에게는 직렬화되지 않는다.
 * (ADR-0008 "Admin role-gated observability" — company 스코프 격리)
 */
interface SsePayload {
  type: string;
  data: Record<string, unknown>;
  companyId: string;
  timestamp: string;
}

@Injectable()
export class AgentSseService {
  private readonly subject = new Subject<SsePayload>();

  @OnEvent(AGENT_EVENTS.STATUS_CHANGED)
  handleStatusChanged(event: AgentStatusChangedEvent) {
    this.subject.next({
      type: 'status_changed',
      data: {
        agentId: event.agentId,
        agentName: event.agentName,
        status: event.status,
        runId: event.runId,
      },
      companyId: event.companyId,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent(AGENT_EVENTS.BUDGET_WARNING)
  handleBudgetWarning(event: AgentBudgetWarningEvent) {
    this.subject.next({
      type: 'budget_warning',
      data: {
        agentId: event.agentId,
        agentName: event.agentName,
        level: event.level,
        usageRatio: event.usageRatio,
        tokensUsed: event.tokensUsed,
        budget: event.budget,
      },
      companyId: event.companyId,
      timestamp: new Date().toISOString(),
    });
  }

  @OnEvent(AGENT_EVENTS.AUTO_PAUSED)
  handleAutoPaused(event: AgentAutoPausedEvent) {
    this.subject.next({
      type: 'auto_paused',
      data: {
        agentId: event.agentId,
        agentName: event.agentName,
        consecutiveFailCount: event.consecutiveFailCount,
        lastError: event.lastError,
      },
      companyId: event.companyId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * SSE 스트림. 구독자의 `companyId` 와 일치하는 이벤트만 통과.
   * 클라이언트 응답 직전 `companyId` 는 제거 (내부 라우팅 전용).
   */
  getStream(subscriberCompanyId: string): Observable<MessageEvent> {
    return this.subject.asObservable().pipe(
      filter((payload) => payload.companyId === subscriberCompanyId),
      map((payload) => {
        const { companyId: _drop, ...publicPayload } = payload;
        return { data: publicPayload } as MessageEvent;
      }),
    );
  }
}
