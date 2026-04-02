export interface CSRecord {
  id: string;
  orderId: string | null;
  productId: string | null;
  csType: string;
  csStatus: string;
  priority: string;
  assignee: string | null;
  content: string;
  resolution: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface CSSummary {
  total: number;
  접수: number;
  처리중: number;
  완료: number;
}
