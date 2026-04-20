export interface TaskSeed {
  taskKey: string;
  type: 'human' | 'ai';
  label: string;
  detail?: string;
  where?: string;
  href?: string;
  priority: 'urgent' | 'high' | 'medium';
  role?: string;
  apiCall?: Record<string, unknown>;
}

export interface RelatedProduct {
  /**
   * masterId 의미 (B2c.dashboard 이후).
   * ProfitLoss path: listing.master.id (fallback: listingId).
   * Inventory path: option.master.id (fallback: optionId).
   * 필드명은 id 로 유지 — downstream frontend 재배선은 Plan D 범위.
   */
  id: string;
  name: string;
  metric: string;
  value: string;
}
