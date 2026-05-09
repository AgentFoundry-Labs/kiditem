import type { AgentDefinitionRuntimeKind } from '@kiditem/shared/agent-os';
import {
  Megaphone, Package, Palette, Search, Shield, ShoppingBag, type LucideIcon,
} from 'lucide-react';

export interface OrgNode {
  id: string;
  name: string;
  agentType?: string;
  runtimeKind?: AgentDefinitionRuntimeKind;
  type: string;
  role: string;
  title: string;
  status: string;
  lastHeartbeatAt?: string | null;
  category?: string;
  reports?: OrgNode[];
  tools?: OrgNode[];
}

export interface TeamStyle {
  color: string;
  icon: LucideIcon;
  label: string;
}

export const TEAM_STYLE_LIGHT: Record<string, TeamStyle> = {
  coupang: { color: '#e44d26', icon: ShoppingBag, label: '쿠팡팀' },
  product: { color: '#3b82f6', icon: Package, label: '상품관리팀' },
  analytics: { color: '#8b5cf6', icon: Megaphone, label: '광고팀' },
  content: { color: '#10b981', icon: Palette, label: '콘텐츠팀' },
  sourcing: { color: '#f59e0b', icon: Search, label: '소싱팀' },
  operations: { color: '#06b6d4', icon: Shield, label: '운영팀' },
};

export const TEAM_STYLE_DARK: Record<string, TeamStyle> = {
  coupang: { color: '#fb7a5c', icon: ShoppingBag, label: '쿠팡팀' },
  product: { color: '#60a5fa', icon: Package, label: '상품관리팀' },
  analytics: { color: '#a78bfa', icon: Megaphone, label: '광고팀' },
  content: { color: '#34d399', icon: Palette, label: '콘텐츠팀' },
  sourcing: { color: '#fbbf24', icon: Search, label: '소싱팀' },
  operations: { color: '#22d3ee', icon: Shield, label: '운영팀' },
};

export const CATEGORY_FACE: Record<string, string> = {
  coupang: 'rose', product: 'blue', analytics: 'violet', content: 'emerald',
  sourcing: 'amber', operations: 'cyan', management: 'violet',
};

export function useTeamStyle(): Record<string, TeamStyle> {
  return TEAM_STYLE_DARK;
}
