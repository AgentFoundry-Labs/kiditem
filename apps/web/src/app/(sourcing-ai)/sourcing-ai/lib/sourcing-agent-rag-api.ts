import { apiClient } from '@/lib/api-client';

export type SourcingAgentRagSuggestedFilter = 'all' | 'selected' | 'selling' | 'strong' | 'new' | 'wholesale';

export interface SourcingAgentRagContext {
  document: {
    id: string;
    sourceScope: 'keyword_analysis' | 'today_recommendations' | 'interest_tracking';
    sourceSnapshotId: string;
    sourceDate: string;
    kind: 'interest' | 'recommendation' | 'keyword' | 'trend' | 'agent';
    title: string;
    text: string;
    tags: string[];
    metadata: Record<string, string | number | boolean | null>;
  };
  score: number;
  snippet: string;
}

export interface SourcingAgentRagQueryResponse {
  answer: string;
  contexts: SourcingAgentRagContext[];
  suggestedFilter: SourcingAgentRagSuggestedFilter | null;
  index: {
    generatedAt: string;
    documentCount: number;
    sourceSnapshotCount: number;
    sourceScopes: Array<'keyword_analysis' | 'today_recommendations' | 'interest_tracking'>;
  };
}

export interface SourcingAgentRagRebuildResponse {
  index: SourcingAgentRagQueryResponse['index'];
}

export function querySourcingAgentRag(input: {
  message: string;
  topK?: number;
  days?: number;
}): Promise<SourcingAgentRagQueryResponse> {
  return apiClient.post<SourcingAgentRagQueryResponse>('/api/sourcing/agent-rag/query', input);
}

export function rebuildSourcingAgentRag(input: {
  days?: number;
} = {}): Promise<SourcingAgentRagRebuildResponse> {
  return apiClient.post<SourcingAgentRagRebuildResponse>('/api/sourcing/agent-rag/rebuild', input);
}
