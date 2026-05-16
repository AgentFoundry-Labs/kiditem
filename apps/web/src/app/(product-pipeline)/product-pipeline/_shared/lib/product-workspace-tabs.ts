export const PRODUCT_WORKSPACE_TAB_KEYS = [
  'basic',
  'options',
  'thumbnail',
  'detail',
  'raw',
] as const;

export type ProductWorkspaceTab = (typeof PRODUCT_WORKSPACE_TAB_KEYS)[number];

export const DEFAULT_PRODUCT_WORKSPACE_TAB: ProductWorkspaceTab = 'basic';

export const PRODUCT_WORKSPACE_TABS: Array<{
  key: ProductWorkspaceTab;
  label: string;
  iconKey?: 'database' | 'thumbnail';
}> = [
  { key: 'basic', label: '기본정보' },
  { key: 'options', label: '옵션·판매가' },
  { key: 'thumbnail', label: '썸네일', iconKey: 'thumbnail' },
  { key: 'detail', label: '상세페이지' },
  { key: 'raw', label: '원본 데이터', iconKey: 'database' },
];

export function parseProductWorkspaceTab(
  value: string | null | undefined,
): ProductWorkspaceTab {
  return PRODUCT_WORKSPACE_TAB_KEYS.includes(value as ProductWorkspaceTab)
    ? (value as ProductWorkspaceTab)
    : DEFAULT_PRODUCT_WORKSPACE_TAB;
}

export function buildProductWorkspaceTabUrl({
  pathname,
  currentSearch,
  tab,
  generationId,
  thumbnailMode,
  imageUrl,
  uploadKey,
}: {
  pathname: string;
  currentSearch?: string | URLSearchParams | null;
  tab: ProductWorkspaceTab;
  generationId?: string | null;
  thumbnailMode?: 'edit' | 'creative' | null;
  imageUrl?: string | null;
  uploadKey?: string | null;
}): string {
  const params = new URLSearchParams(currentSearch?.toString() ?? '');
  params.delete('tab');
  if (tab === DEFAULT_PRODUCT_WORKSPACE_TAB) {
    // Basic is the default tab, so the clean URL carries no tab query.
  } else {
    params.set('tab', tab);
  }
  params.delete('generationId');
  params.delete('thumbnailMode');
  params.delete('imageUrl');
  params.delete('uploadKey');
  if (generationId) params.set('generationId', generationId);
  if (thumbnailMode) params.set('thumbnailMode', thumbnailMode);
  if (imageUrl) params.set('imageUrl', imageUrl);
  if (uploadKey) params.set('uploadKey', uploadKey);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
