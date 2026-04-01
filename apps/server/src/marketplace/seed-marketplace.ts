/**
 * 마켓플레이스 시드 — 기존 DB 데이터 기반.
 * 하드코딩된 목 데이터 없이, 기존 agent_definitions와 workflow_templates에서
 * 마켓플레이스 카탈로그를 자동 생성한다.
 */

// 에이전트 카테고리 매핑 (role → category)
export function agentCategory(type: string): string {
  const map: Record<string, string> = {
    ad_strategy: 'operations',
    rules_evaluation: 'analytics',
    rules_suggest: 'analytics',
    manager: 'operations',
    pricing: 'operations',
    inventory_alert: 'monitoring',
    review_monitor: 'monitoring',
  };
  return map[type] ?? 'operations';
}

// 워크플로우 카테고리 매핑 (module → category)
export function workflowCategory(module: string): string {
  const map: Record<string, string> = {
    order: 'automation',
    accounting: 'automation',
    inventory: 'monitoring',
    report: 'reporting',
    cs: 'automation',
    product: 'automation',
    marketing: 'automation',
  };
  return map[module] ?? 'automation';
}

// 에이전트 기본 configurableParams
export function defaultAgentParams(): any[] {
  return [
    { key: 'schedule', label: '실행 스케줄', type: 'cron', default: null, description: 'cron 표현식 (비워두면 수동 실행)' },
    { key: 'monthlyTokenBudget', label: '월 토큰 예산', type: 'number', default: 0, description: '0 = 무제한' },
    { key: 'requiresApproval', label: '실행 전 승인', type: 'boolean', default: true },
    { key: 'timeoutSeconds', label: '실행 제한 시간 (초)', type: 'number', default: 300 },
  ];
}

// 워크플로우 기본 configurableParams
export function defaultWorkflowParams(): any[] {
  return [
    { key: 'schedule', label: '실행 스케줄', type: 'cron', default: null, description: 'cron 표현식 (비워두면 수동 실행)' },
  ];
}
