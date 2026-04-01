export class AgentStatusChangedEvent {
  constructor(
    public readonly agentId: string,
    public readonly agentName: string,
    public readonly status: 'running' | 'succeeded' | 'failed' | 'paused' | 'idle',
    public readonly runId?: string,
    public readonly data?: Record<string, unknown>,
  ) {}
}

export class AgentBudgetWarningEvent {
  constructor(
    public readonly agentId: string,
    public readonly agentName: string,
    public readonly level: 'warning' | 'critical' | 'exceeded',
    public readonly usageRatio: number,
    public readonly tokensUsed: number,
    public readonly budget: number,
  ) {}
}

export class AgentAutoPausedEvent {
  constructor(
    public readonly agentId: string,
    public readonly agentName: string,
    public readonly consecutiveFailCount: number,
    public readonly lastError?: string,
  ) {}
}

// 이벤트 이름 상수
export const AGENT_EVENTS = {
  STATUS_CHANGED: 'agent.status.changed',
  BUDGET_WARNING: 'agent.budget.warning',
  AUTO_PAUSED: 'agent.auto.paused',
} as const;
