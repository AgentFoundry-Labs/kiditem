import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { useContentWorkspaceImages } from '../useContentWorkspaceImages';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn() } }));

function renderWithClient(workspaceId: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useContentWorkspaceImages(workspaceId), { wrapper });
}

describe('useContentWorkspaceImages', () => {
  beforeEach(() => vi.mocked(apiClient.get).mockReset());

  it('does not request assets without a workspace owner', () => {
    const { result } = renderWithClient(null);

    expect(result.current.images).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('adapts workspace assets for the existing image picker', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      items: [{
        id: 'asset-1',
        url: 'https://cdn.example.com/a.jpg',
        role: 'detail',
        label: '상세 이미지',
        sortOrder: 2,
      }],
      total: 1,
      page: 1,
      limit: 100,
    });

    const { result } = renderWithClient('workspace-1');

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/ai/content-assets?contentWorkspaceId=workspace-1&limit=100',
    );
    expect(result.current.images).toEqual([{
      id: 'asset-1',
      url: 'https://cdn.example.com/a.jpg',
      role: 'detail',
      label: '상세 이미지',
      sortOrder: 2,
      source: 'content_asset',
    }]);
  });
});
