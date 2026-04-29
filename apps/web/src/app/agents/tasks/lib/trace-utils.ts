/**
 * AgentTrace 페이지 공유 유틸리티.
 */

export function shortId(id: string, len = 8): string {
  return id.length <= len ? id : id.slice(0, len);
}

export function computeDurationMs(
  startedAt: string | Date | null,
  completedAt: string | Date | null,
): number | null {
  if (!startedAt || !completedAt) return null;
  const s = new Date(startedAt).getTime();
  const e = new Date(completedAt).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  return e - s;
}

export function formatDurationMs(ms: number | null): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s === 0 ? `${m}분` : `${m}분 ${s}초`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}시간` : `${h}시간 ${mm}분`;
}

// 진행 중으로 간주되는 task.status 집합 — refetchInterval 활성 조건에 사용
const RUNNING_STATUSES = new Set(['running', 'queued', 'scheduled', 'pending']);

export function isRunningStatus(status: string | null | undefined): boolean {
  return !!status && RUNNING_STATUSES.has(status);
}

// 이벤트 타입 → 위험도 분류 (실패 강조용).
// 참조: apps/server/src/agent-registry/events/agent-events.ts AGENT_EVENTS
const DANGER_EVENT_TYPES = new Set<string>([
  'agent.permission.denied',
  'agent.action_cap.violated',
  'agent.auto.paused',
  'agent.validation.retry',
  'agent.dry_run.forced',
]);

export function isDangerEvent(eventType: string): boolean {
  return DANGER_EVENT_TYPES.has(eventType);
}

export function statusBadgeVariant(
  status: string,
): 'success' | 'error' | 'warning' | 'info' | 'processing' | 'default' {
  switch (status) {
    case 'succeeded':
    case 'completed':
      return 'success';
    case 'failed':
    case 'error':
      return 'error';
    case 'paused':
    case 'cancelled':
      return 'warning';
    case 'running':
      return 'processing';
    case 'queued':
    case 'scheduled':
    case 'pending':
      return 'info';
    default:
      return 'default';
  }
}
