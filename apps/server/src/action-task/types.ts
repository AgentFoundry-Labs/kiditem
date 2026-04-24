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
   * masterId 의미.
   * Live metrics path: `PerListingMetrics.masterId`.
   * Inventory path: option.master.id (fallback: optionId).
   * 필드명은 id 로 유지 — downstream frontend rewire 는 별도 typed-boundary follow-up.
   */
  id: string;
  name: string;
  metric: string;
  value: string;
}
