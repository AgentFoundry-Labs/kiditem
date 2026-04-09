export interface OrgNode {
  id: string;
  name: string;
  type: string;
  role: string;
  title: string | null;
  status: string;
  adapterType: string;
  lastHeartbeatAt: string | null;
  hired: boolean;
  marketplaceId: string | null;
  reports: OrgNode[];
}
