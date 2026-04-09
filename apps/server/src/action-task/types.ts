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
  id: string;
  name: string;
  metric: string;
  value: string;
}
