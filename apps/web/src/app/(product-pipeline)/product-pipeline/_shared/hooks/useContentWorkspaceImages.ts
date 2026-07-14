import { useQuery } from '@tanstack/react-query';
import type { MasterImageItem, MasterImageRole } from '@kiditem/shared/product';
import { apiClient } from '@/lib/api-client';

const EMPTY_IMAGES: MasterImageItem[] = [];
const IMAGE_ROLES = new Set<MasterImageRole>([
  'box',
  'product',
  'color_variant',
  'size_chart',
  'detail',
]);

interface ContentAssetListResponse {
  items: Array<{
    id: string;
    url: string;
    role: string | null;
    label: string | null;
    sortOrder: number;
  }>;
  total: number;
  page: number;
  limit: number;
}

export function useContentWorkspaceImages(contentWorkspaceId: string | null) {
  const query = useQuery({
    queryKey: ['content-workspace-images', contentWorkspaceId],
    queryFn: async () => {
      if (!contentWorkspaceId) return EMPTY_IMAGES;
      const result = await apiClient.get<ContentAssetListResponse>(
        `/api/ai/content-assets?contentWorkspaceId=${encodeURIComponent(contentWorkspaceId)}&limit=100`,
      );
      return result.items.map((asset): MasterImageItem => ({
        id: asset.id,
        url: asset.url,
        role: isImageRole(asset.role) ? asset.role : 'product',
        label: asset.label,
        sortOrder: asset.sortOrder,
        source: 'content_asset',
      }));
    },
    enabled: Boolean(contentWorkspaceId),
  });

  return {
    images: query.data ?? EMPTY_IMAGES,
    loading: Boolean(contentWorkspaceId) && query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}

function isImageRole(value: string | null): value is MasterImageRole {
  return value !== null && IMAGE_ROLES.has(value as MasterImageRole);
}
