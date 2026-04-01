import { describe, it, expect } from 'vitest';
import { AgentSseService } from '../agent-sse.service';
import {
  AgentStatusChangedEvent,
  AgentBudgetWarningEvent,
  AgentAutoPausedEvent,
} from '../agent-events';
import { firstValueFrom, take } from 'rxjs';

describe('AgentSseService', () => {
  it('emits status_changed SSE payload on handleStatusChanged', async () => {
    const service = new AgentSseService();
    const stream$ = service.getStream().pipe(take(1));

    // subscribe first, then emit (Subject does not buffer)
    const eventPromise = firstValueFrom(stream$);

    service.handleStatusChanged(
      new AgentStatusChangedEvent('a-1', 'Test Agent', 'running', 'run-1'),
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
    expect(event.data.timestamp).toBeDefined();
  });

  it('emits budget_warning SSE payload on handleBudgetWarning', async () => {
    const service = new AgentSseService();
    const stream$ = service.getStream().pipe(take(1));

    const eventPromise = firstValueFrom(stream$);

    service.handleBudgetWarning(
      new AgentBudgetWarningEvent('a-1', 'Test Agent', 'critical', 0.95, 950, 1000),
    );

    const event = await eventPromise;
    expect(event.data).toMatchObject({
      type: 'budget_warning',
      data: { level: 'critical', usageRatio: 0.95 },
    });
  });

  it('emits auto_paused SSE payload on handleAutoPaused', async () => {
    const service = new AgentSseService();
    const stream$ = service.getStream().pipe(take(1));

    const eventPromise = firstValueFrom(stream$);

    service.handleAutoPaused(
      new AgentAutoPausedEvent('a-1', 'Test Agent', 3, 'timeout'),
    );

    const event = await eventPromise;
    expect(event.data).toMatchObject({
      type: 'auto_paused',
      data: { consecutiveFailCount: 3, lastError: 'timeout' },
    });
  });
});
