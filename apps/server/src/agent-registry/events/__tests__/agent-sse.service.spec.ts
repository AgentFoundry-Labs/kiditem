import { describe, it, expect } from 'vitest';
import { AgentSseService } from '../agent-sse.service';
import {
  AgentStatusChangedEvent,
  AgentBudgetWarningEvent,
  AgentAutoPausedEvent,
} from '../agent-events';
import { firstValueFrom, take, toArray, lastValueFrom, timer } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

describe('AgentSseService', () => {
  it('emits status_changed SSE payload on handleStatusChanged', async () => {
    const service = new AgentSseService();
    const stream$ = service.getStream('co-1').pipe(take(1));

    // subscribe first, then emit (Subject does not buffer)
    const eventPromise = firstValueFrom(stream$);

    service.handleStatusChanged(
      new AgentStatusChangedEvent('a-1', 'Test Agent', 'running', 'co-1', 'run-1'),
    );

    const event = await eventPromise;
    expect(event.data).toMatchObject({
      type: 'status_changed',
      data: {
        agentId: 'a-1',
        agentName: 'Test Agent',
        status: 'running',
        runId: 'run-1',
      },
    });
    expect((event.data as any).timestamp).toBeDefined();
    // companyId 는 구독자 응답에서 제거되어야 한다 (내부 라우팅 전용).
    expect((event.data as any).companyId).toBeUndefined();
  });

  it('emits budget_warning SSE payload on handleBudgetWarning', async () => {
    const service = new AgentSseService();
    const stream$ = service.getStream('co-1').pipe(take(1));

    const eventPromise = firstValueFrom(stream$);

    service.handleBudgetWarning(
      new AgentBudgetWarningEvent('a-1', 'Test Agent', 'critical', 0.95, 950, 1000, 'co-1'),
    );

    const event = await eventPromise;
    expect(event.data).toMatchObject({
      type: 'budget_warning',
      data: { level: 'critical', usageRatio: 0.95 },
    });
  });

  it('emits auto_paused SSE payload on handleAutoPaused', async () => {
    const service = new AgentSseService();
    const stream$ = service.getStream('co-1').pipe(take(1));

    const eventPromise = firstValueFrom(stream$);

    service.handleAutoPaused(
      new AgentAutoPausedEvent('a-1', 'Test Agent', 3, 'co-1', 'timeout'),
    );

    const event = await eventPromise;
    expect(event.data).toMatchObject({
      type: 'auto_paused',
      data: { consecutiveFailCount: 3, lastError: 'timeout' },
    });
  });

  it('filters events by companyId — subscriber only receives own company events', async () => {
    const service = new AgentSseService();
    // co-1 구독자의 스트림을 200ms 동안 수집
    const collected$ = service
      .getStream('co-1')
      .pipe(takeUntil(timer(200)), toArray());
    const collectedPromise = lastValueFrom(collected$);

    // co-1 1건 + co-2 1건 emit
    service.handleStatusChanged(
      new AgentStatusChangedEvent('a-1', 'Agent 1', 'running', 'co-1', 'run-1'),
    );
    service.handleStatusChanged(
      new AgentStatusChangedEvent('a-2', 'Agent 2', 'running', 'co-2', 'run-2'),
    );

    const events = await collectedPromise;
    expect(events.length).toBe(1);
    expect((events[0].data as any).data.agentId).toBe('a-1');
  });
});
