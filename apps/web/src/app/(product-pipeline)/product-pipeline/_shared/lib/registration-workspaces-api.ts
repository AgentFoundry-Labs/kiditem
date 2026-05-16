import { apiClient } from '@/lib/api-client';

export interface RegistrationWorkspaceHistoryItem {
  id: string;
  contentType: string;
  status: string;
  generatedTitle: string | null;
  templateId: string | null;
  generationInput: unknown;
  detailPageData: Record<string, unknown> | null;
  imageUrls: string[];
  processedImages: Record<string, string>;
  detailPageArtifactId: string | null;
  href: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationWorkspaceSummary {
  id: string;
  ownerType: string;
  sourceCandidateId: string | null;
  targetMasterId: string | null;
  displayName: string;
  normalizedTitle: string;
  status: string;
  href: string;
  generationCount: number;
  latestGenerationId: string | null;
  latestStatus: string | null;
  currentDetailPageArtifactId: string | null;
  currentDetailPageRevisionId: string | null;
  currentDetailPageGenerationId: string | null;
  createdAt: string;
  updatedAt: string;
  history: RegistrationWorkspaceHistoryItem[];
}

interface RegistrationWorkspaceListResponse {
  items: RegistrationWorkspaceSummary[];
  total: number;
  page: number;
  limit: number;
}

interface DuplicateRegistrationWorkspaceResponse {
  exists: boolean;
  workspace: RegistrationWorkspaceSummary | null;
}

export const registrationWorkspacesApi = {
  async list(params?: {
    page?: number;
    limit?: number;
    title?: string;
  }): Promise<RegistrationWorkspaceListResponse> {
    const qs = new URLSearchParams({
      page: String(params?.page ?? 1),
      limit: String(params?.limit ?? 24),
    });
    if (params?.title) qs.set('title', params.title);
    return apiClient.get<RegistrationWorkspaceListResponse>(
      `/api/ai/registration-workspaces?${qs}`,
    );
  },

  async get(id: string): Promise<RegistrationWorkspaceSummary> {
    return apiClient.get<RegistrationWorkspaceSummary>(
      `/api/ai/registration-workspaces/${encodeURIComponent(id)}`,
    );
  },

  async create(input: {
    title: string;
    sourceCandidateId?: string | null;
    targetMasterId?: string | null;
  }): Promise<RegistrationWorkspaceSummary> {
    return apiClient.post<RegistrationWorkspaceSummary>('/api/ai/registration-workspaces', {
      title: input.title,
      ...(input.sourceCandidateId ? { sourceCandidateId: input.sourceCandidateId } : {}),
      ...(input.targetMasterId ? { targetMasterId: input.targetMasterId } : {}),
    });
  },

  async checkDuplicate(title: string): Promise<DuplicateRegistrationWorkspaceResponse> {
    const qs = new URLSearchParams({ title });
    return apiClient.get<DuplicateRegistrationWorkspaceResponse>(
      `/api/ai/registration-workspaces/duplicate-check?${qs}`,
    );
  },

  async archive(id: string): Promise<{ ok: true; archivedWorkspaces: number }> {
    return apiClient.delete<{ ok: true; archivedWorkspaces: number }>(
      `/api/ai/registration-workspaces/${encodeURIComponent(id)}`,
    );
  },

  async selectCurrentDetailPage(
    id: string,
    contentGenerationId: string,
  ): Promise<RegistrationWorkspaceSummary> {
    return apiClient.patch<RegistrationWorkspaceSummary>(
      `/api/ai/registration-workspaces/${encodeURIComponent(id)}/current-detail-page`,
      { contentGenerationId },
    );
  },
};
