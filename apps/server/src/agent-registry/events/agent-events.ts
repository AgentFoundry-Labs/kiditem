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

export class AgentPermissionDeniedEvent {
  constructor(
    public readonly agentId: string,
    public readonly agentName: string,
    public readonly category: string,
    public readonly detail: string,
  ) {}
}

export class AgentDelegationEvent {
  constructor(
    public readonly parentAgentId: string,
    public readonly childAgentId: string,
    public readonly reason: string,
  ) {}
}

// 이벤트 이름 상수
export const AGENT_EVENTS = {
  STATUS_CHANGED: 'agent.status.changed',
  BUDGET_WARNING: 'agent.budget.warning',
  AUTO_PAUSED: 'agent.auto.paused',
  PERMISSION_DENIED: 'agent.permission.denied',
  DELEGATION_REQUESTED: 'agent.delegation.requested',
  VALIDATION_RETRY: 'agent.validation.retry',
  ACTION_CAP_VIOLATED: 'agent.action_cap.violated',
  TRUST_LEVEL_CHANGED: 'agent.trust_level.changed',
  DRY_RUN_FORCED: 'agent.dry_run.forced',
  SNAPSHOT_CREATED: 'agent.snapshot.created',
  ROLLBACK_EXECUTED: 'agent.rollback.executed',
} as const;
