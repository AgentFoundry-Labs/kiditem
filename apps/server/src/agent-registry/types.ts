export interface OrgNode {
  id: string;
  name: string;
  type: string;
  role: string;
  title: string | null;
  status: string;
  adapterType: string;
  category: string;
  lastHeartbeatAt: string | null;
  hired: boolean;
  marketplaceId: string | null;
  reports: OrgNode[];
}

export const TEAM_LABELS: Record<string, string> = {
  coupang: '쿠팡팀',
  product: '상품관리팀',
  analytics: '광고팀',
  content: '콘텐츠팀',
  sourcing: '소싱팀',
  operations: '운영팀',
};

export const TEAM_ORDER = ['coupang', 'product', 'analytics', 'content', 'sourcing', 'operations'];
