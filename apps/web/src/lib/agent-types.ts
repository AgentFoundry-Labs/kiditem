'use client';

export type AgentStatus = 'idle' | 'running' | 'paused' | 'error' | 'terminated' | 'active';
export type AgentRole = 'specialist' | 'manager' | 'ceo';
export type AdapterType = 'claude_local' | 'codex_local' | 'process' | 'http';
export type WakeupSource = 'timer' | 'assignment' | 'on_demand' | 'automation';
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled';

export const ROLE_LABELS: Record<string, string> = {
  specialist: 'Specialist',
  manager: 'Manager',
  ceo: 'CEO',
};

export const ADAPTER_LABELS: Record<string, string> = {
  claude_local: 'Claude',
  codex_local: 'Codex',
  process: 'Process',
  http: 'HTTP',
};

export const SOURCE_LABELS: Record<string, string> = {
  timer: 'Timer',
  assignment: 'Assignment',
  on_demand: 'On-demand',
  automation: 'Automation',
};

export interface Agent {
  id: string;
  companyId: string | null;
  name: string;
  type: string;
  description: string | null;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  runtimeConfig: Record<string, unknown>;
  role: string;
  title: string | null;
  icon: string | null;
  reportsTo: string | null;
  status: string;
  pauseReason: string | null;
  pausedAt: string | null;
  permissions: Record<string, unknown>;
  skills: string[];
  promptTemplate: string;
  allowedTools: string;
  permissionMode: string;
  monthlyTokenBudget: number;
  tokensUsed: number;
  budgetResetAt: string | null;
  schedule: string | null;
  timeoutSeconds: number;
  requiresApproval: boolean;
  isActive: boolean;
  lastHeartbeatAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  runtimeState?: AgentRuntimeState | null;
}

export interface OrgNode {
  id: string;
  name: string;
  type: string;
  role: string;
  title: string | null;
  status: string;
  adapterType: string;
  lastHeartbeatAt: string | null;
  reports: OrgNode[];
}

export interface HeartbeatRun {
  id: string;
  companyId: string;
  agentId: string;
  invocationSource: string;
  triggerDetail: string | null;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  exitCode: number | null;
  signal: string | null;
  usageJson: Record<string, unknown> | null;
  resultJson: Record<string, unknown> | null;
  sessionIdBefore: string | null;
  sessionIdAfter: string | null;
  stdoutExcerpt: string | null;
  stderrExcerpt: string | null;
  errorCode: string | null;
  processPid: number | null;
  wakeupRequestId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRuntimeState {
  agentId: string;
  companyId: string;
  adapterType: string;
  sessionId: string | null;
  stateJson: Record<string, unknown>;
  lastRunId: string | null;
  lastRunStatus: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostCents: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export const SKILL_DESCRIPTIONS: Record<string, string> = {
  'db-query': 'PostgreSQL 쿼리 실행 패턴. psql CLI로 KidItem DB 조회.',
  'result-callback': '작업 완료 후 NestJS API로 결과를 전송하는 규칙.',
  'coupang-browse': '쿠팡 Wing 대시보드 브라우저 조작 가이드.',
  'kiditem-api': 'KidItem NestJS 백엔드 API 사용법.',
  'data-analysis': '이커머스 데이터 분석 패턴. 성과 진단 및 액션 추천.',
};

export type FilterTab = 'all' | 'active' | 'paused' | 'error';
export type ViewMode = 'list' | 'org';
export type AgentDetailTab = 'dashboard' | 'instructions' | 'skills' | 'configuration' | 'runs' | 'budget';
