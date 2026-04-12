import { SOURCE_LABELS } from '../../lib/agent-types';
import type { HeartbeatRun } from '../../lib/agent-types';

export interface RunWithAgent extends HeartbeatRun {
  agentName: string;
  agentIcon: string | null;
}

export const SOURCE_COLORS: Record<string, string> = {
  timer: 'bg-blue-100 text-blue-700',
  assignment: 'bg-violet-100 text-violet-700',
  on_demand: 'bg-cyan-100 text-cyan-700',
  automation: 'bg-amber-100 text-amber-700',
};

export const AGENT_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-green-100 text-green-700',
  'bg-amber-100 text-amber-700',
  'bg-cyan-100 text-cyan-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
];

export function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}

export function agentInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function statusLabel(run: HeartbeatRun): string {
  const labels: Record<string, string> = {
    succeeded: '완료',
    failed: '실패',
    running: '실행 중',
    queued: '대기 중',
    timed_out: '시간 초과',
    cancelled: '취소됨',
  };
  return labels[run.status] ?? run.status;
}

export function runDescription(run: RunWithAgent): string {
  const src = SOURCE_LABELS[run.invocationSource] ?? run.invocationSource;
  const stat = statusLabel(run);
  return `하트비트 실행 ${stat} (${src})`;
}

export function groupLabel(dateStr: string | Date): string {
  const today = new Date();
  const d = new Date(dateStr);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dMid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((todayMid.getTime() - dMid.getTime()) / 86400_000);
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return '이번 주';
  if (diffDays < 30) return '이번 달';
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
}
