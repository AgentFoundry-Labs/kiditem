import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  AgentStatusChangedEvent,
  AgentBudgetWarningEvent,
  AgentAutoPausedEvent,
  AGENT_EVENTS,
} from './agent-events';

interface SsePayload {
  type: string;
  data: Record<string, unknown>;
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
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * SSE 스트림. companyId로 필터링 가능 (향후 멀티테넌트).
   */
  getStream(): Observable<MessageEvent> {
    return this.subject.asObservable().pipe(
      map((payload) => ({ data: payload }) as MessageEvent),
    );
  }
}
