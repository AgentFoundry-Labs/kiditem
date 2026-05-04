import type { ActionTask } from '@kiditem/shared/action-task';
import { formatKRW, formatNumber } from '@/lib/utils';
import type { OrgNode } from './agent-os-types';

export function flattenNodes(nodes: OrgNode[]): OrgNode[] {
  const out: OrgNode[] = [];
  for (const n of nodes) {
    out.push(n);
    if (n.reports?.length) out.push(...flattenNodes(n.reports));
  }
  return out;
}

export function classifyAction(a: ActionTask): string {
  const key = `${a.taskKey} ${a.label} ${a.role ?? ''}`.toLowerCase();
  if (/wing|리뷰.*수집|광고.*수집|coupang|쿠팡|collector/.test(key)) return 'coupang';
  if (a.role === 'ad' || /ad_strategy|h-ad|ad-/.test(a.taskKey)) return 'analytics';
  if (
    /finance|inventory|data/.test(a.role ?? '')
    || /grade|recalc|health|rule|ctr|thumbnail|review|reorder|stock|price|profit|적자|등급|건강|규칙|썸네일|리뷰|재주문|재고|가격|수익/.test(key)
  ) return 'product';
  if (/content|상세|detail|이미지|image/.test(key)) return 'content';
  if (/sourcing|소싱|1688|alibaba/.test(key)) return 'sourcing';
  if (/cs|고객|반품|return|chat|dashboard|대시보드|정산/.test(key)) return 'operations';
  return 'product';
}

export function classifyAgentCategory(agent: OrgNode): string {
  const key = `${agent.category ?? ''} ${agent.role} ${agent.type} ${agent.name} ${agent.title ?? ''}`.toLowerCase();
  if (/wing|coupang|collector|channel|쿠팡/.test(key)) return 'coupang';
  if (/ad|ads|roas|campaign|analytics|광고|분석/.test(key)) return 'analytics';
  if (/content|thumbnail|image|detail|상세|콘텐츠|썸네일|이미지/.test(key)) return 'content';
  if (/sourcing|source|1688|alibaba|소싱/.test(key)) return 'sourcing';
  if (/cs|return|order|review|customer|chat|반품|주문|리뷰|고객/.test(key)) return 'operations';
  return 'product';
}

export function findAgentTeam(teams: OrgNode[], agentId: string): OrgNode | undefined {
  return teams.find(t => t.reports?.some(a => a.id === agentId));
}

export function compactKRW(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)}억`;
  if (abs >= 1_0000) return `${formatNumber(Math.round(n / 1_0000))}만`;
  return formatKRW(n);
}
