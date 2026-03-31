'use client';

export type { Agent, HeartbeatRun, AgentRuntimeState, DailyCost, AgentCostSummary, CostAnalytics } from '@kiditem/shared';

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
