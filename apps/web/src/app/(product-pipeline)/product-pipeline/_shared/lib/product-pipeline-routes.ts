import type { ThumbnailSubjectParams } from './thumbnail-subject';
import { buildProductWorkspaceTabUrl, type ProductWorkspaceTab } from './product-workspace-tabs';

export const PRODUCT_PIPELINE_ROOT = '/product-pipeline';
export const COLLECTED_PRODUCTS_ROOT = `${PRODUCT_PIPELINE_ROOT}/collected-products`;
export const REGISTERED_PRODUCTS_ROOT = `${PRODUCT_PIPELINE_ROOT}/registered-products`;
export const DETAIL_PAGE_EDITOR_ROOT = `${PRODUCT_PIPELINE_ROOT}/detail-pages`;
export const PRODUCT_GENERATION_ROOT = `${PRODUCT_PIPELINE_ROOT}/productgenerate`;
export const DETAIL_TEMPLATE_GENERATION_ROOT = `${PRODUCT_PIPELINE_ROOT}/detail-template-generation`;
export const THUMBNAIL_AI_ROOT = `${PRODUCT_PIPELINE_ROOT}/thumbnail-ai`;
export const THUMBNAIL_GENERATION_ROOT = `${PRODUCT_PIPELINE_ROOT}/thumbnail-generation`;
export const THUMBNAIL_GENERATION_EDIT_ROOT = `${THUMBNAIL_GENERATION_ROOT}/edit`;

/** 수집상품 작업공간 화면. 판매상품 초안 id 로 연다(KID-310 · ADR-0022) — 원천 기록 id 가 아니다. */
export function collectedProductDetailHref(salesProductId: string): string {
  return `${COLLECTED_PRODUCTS_ROOT}/${encodeURIComponent(salesProductId)}`;
}

export function registeredProductDetailHref(workspaceId: string): string {
  return `${REGISTERED_PRODUCTS_ROOT}/${encodeURIComponent(workspaceId)}`;
}

export function collectedProductWorkspaceTabHref({
  salesProductId,
  tab,
  generationId,
  thumbnailMode,
  imageUrl,
  uploadKey,
  productName,
  productDescription,
  editCase,
  productId,
  sourceCandidateId,
  contentWorkspaceId,
}: {
  salesProductId: string;
  tab: ProductWorkspaceTab;
  generationId?: string | null;
  thumbnailMode?: 'edit' | 'creative' | null;
  imageUrl?: string | null;
  uploadKey?: string | null;
  productName?: string | null;
  productDescription?: string | null;
  editCase?: string | null;
  productId?: string | null;
  sourceCandidateId?: string | null;
  contentWorkspaceId?: string | null;
}): string {
  return buildProductWorkspaceTabUrl({
    pathname: collectedProductDetailHref(salesProductId),
    tab,
    generationId,
    thumbnailMode,
    imageUrl,
    uploadKey,
    productName,
    productDescription,
    editCase,
    productId,
    sourceCandidateId,
    contentWorkspaceId,
  });
}

export function registeredProductWorkspaceTabHref({
  workspaceId,
  tab,
  generationId,
  thumbnailMode,
  imageUrl,
  uploadKey,
  productName,
  productDescription,
  editCase,
  productId,
  sourceCandidateId,
  contentWorkspaceId,
}: {
  workspaceId: string;
  tab: ProductWorkspaceTab;
  generationId?: string | null;
  thumbnailMode?: 'edit' | 'creative' | null;
  imageUrl?: string | null;
  uploadKey?: string | null;
  productName?: string | null;
  productDescription?: string | null;
  editCase?: string | null;
  productId?: string | null;
  sourceCandidateId?: string | null;
  contentWorkspaceId?: string | null;
}): string {
  return buildProductWorkspaceTabUrl({
    pathname: registeredProductDetailHref(workspaceId),
    tab,
    generationId,
    thumbnailMode,
    imageUrl,
    uploadKey,
    productName,
    productDescription,
    editCase,
    productId,
    sourceCandidateId,
    contentWorkspaceId,
  });
}

export function thumbnailWorkspaceHref({
  sourceCandidateId,
  contentWorkspaceId,
  returnTo,
  generationId,
  imageUrl,
  uploadKey,
  productName,
  productDescription,
  editCase,
  mode,
}: {
  sourceCandidateId?: string | null;
  contentWorkspaceId?: string | null;
  returnTo?: string | null;
  generationId?: string | null;
  imageUrl?: string | null;
  uploadKey?: string | null;
  productName?: string | null;
  productDescription?: string | null;
  editCase?: string | null;
  mode?: 'edit' | 'creative' | null;
}): string | null {
  const normalizedReturnTo = normalizeProductPipelineReturnTo(returnTo);
  const thumbnailMode = mode ?? null;
  if (normalizedReturnTo?.startsWith(`${COLLECTED_PRODUCTS_ROOT}/`)) {
    const [pathname, currentSearch = ''] = normalizedReturnTo.split('?');
    return buildProductWorkspaceTabUrl({
      pathname,
      currentSearch,
      tab: 'thumbnail',
      generationId,
      thumbnailMode,
      imageUrl,
      uploadKey,
      productName,
      productDescription,
      editCase,
      sourceCandidateId,
      contentWorkspaceId,
    });
  }
  if (normalizedReturnTo?.startsWith(`${REGISTERED_PRODUCTS_ROOT}/`)) {
    const [pathname, currentSearch = ''] = normalizedReturnTo.split('?');
    return buildProductWorkspaceTabUrl({
      pathname,
      currentSearch,
      tab: 'thumbnail',
      generationId,
      thumbnailMode,
      imageUrl,
      uploadKey,
      productName,
      productDescription,
      editCase,
      sourceCandidateId,
      contentWorkspaceId,
    });
  }
  if (contentWorkspaceId) {
    return registeredProductWorkspaceTabHref({
      workspaceId: contentWorkspaceId,
      tab: 'thumbnail',
      generationId,
      thumbnailMode,
      imageUrl,
      uploadKey,
      productName,
      productDescription,
      editCase,
      sourceCandidateId,
      contentWorkspaceId,
    });
  }
  // 원천 기록 id 로는 수집상품 화면을 열지 않는다 — 그 화면은 판매상품 초안 id 로 연다(KID-310).
  return null;
}

export function collectedProductEditorHref({
  salesProductId,
  generationId,
}: {
  salesProductId: string;
  generationId?: string | null;
}): string {
  const href = `${collectedProductDetailHref(salesProductId)}/editor`;
  if (!generationId) return href;
  const params = new URLSearchParams({ generationId });
  return `${href}?${params.toString()}`;
}

export function registeredProductEditorHref(generationId: string): string {
  return `${DETAIL_PAGE_EDITOR_ROOT}/${encodeURIComponent(generationId)}/editor`;
}

/**
 * 상세페이지 에디터. 수집상품 화면에서 열면 `salesProductId` 를 실어 저장 뒤 그 화면 값을 새로
 * 읽게 한다. 생성 이력만 아는 곳(생성 목록 · 완료 알림)은 초안 id 를 모르므로 싣지 않는다.
 */
export function detailPageEditorHref({
  salesProductId,
  generationId,
  returnTo,
}: {
  salesProductId?: string | null;
  generationId?: string | null;
  returnTo?: string | null;
}): string {
  if (salesProductId) {
    if (!generationId) return collectedProductEditorHref({ salesProductId });
    const params = new URLSearchParams({ salesProductId });
    const normalizedReturnTo = normalizeProductPipelineReturnTo(returnTo);
    if (normalizedReturnTo) params.set('returnTo', normalizedReturnTo);
    return `${registeredProductEditorHref(generationId)}?${params.toString()}`;
  }
  if (generationId) {
    const normalizedReturnTo = normalizeProductPipelineReturnTo(returnTo);
    if (!normalizedReturnTo) return registeredProductEditorHref(generationId);
    const params = new URLSearchParams({ returnTo: normalizedReturnTo });
    return `${registeredProductEditorHref(generationId)}?${params.toString()}`;
  }
  return COLLECTED_PRODUCTS_ROOT;
}

export function detailTemplateGenerationHref({
  contentWorkspaceId,
  returnTo,
  title,
}: {
  contentWorkspaceId?: string | null;
  returnTo?: string | null;
  title?: string | null;
} = {}): string {
  const params = new URLSearchParams();
  if (contentWorkspaceId) params.set('contentWorkspaceId', contentWorkspaceId);
  if (title) params.set('title', title);
  const normalizedReturnTo = normalizeProductPipelineReturnTo(returnTo);
  if (normalizedReturnTo) params.set('returnTo', normalizedReturnTo);
  const query = params.toString();
  return query ? `${DETAIL_TEMPLATE_GENERATION_ROOT}?${query}` : DETAIL_TEMPLATE_GENERATION_ROOT;
}

export function productGenerationHref(): string {
  return PRODUCT_GENERATION_ROOT;
}

export function normalizeProductPipelineReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith(`${PRODUCT_PIPELINE_ROOT}/`)) return null;
  if (value.startsWith(THUMBNAIL_GENERATION_ROOT)) return null;
  return value;
}

export function thumbnailGenerationHubHref({
  extraParams,
  imageUrl,
  productDescription,
  productName,
  returnTo,
  subjectParams,
}: {
  extraParams?: Record<string, string | null | undefined>;
  imageUrl?: string | null;
  productDescription?: string | null;
  productName?: string | null;
  returnTo?: string | null;
  subjectParams?: ThumbnailSubjectParams;
} = {}): string {
  const params = new URLSearchParams();
  if (subjectParams?.contentWorkspaceId) {
    params.set('contentWorkspaceId', subjectParams.contentWorkspaceId);
  }
  if (!subjectParams?.contentWorkspaceId && subjectParams?.sourceCandidateId) {
    params.set('sourceCandidateId', subjectParams.sourceCandidateId);
  }
  if (imageUrl) params.set('imageUrl', imageUrl);
  if (productName) params.set('productName', productName);
  if (productDescription) params.set('productDescription', productDescription);
  if (extraParams) {
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
  }
  const normalizedReturnTo = normalizeProductPipelineReturnTo(returnTo);
  if (normalizedReturnTo) params.set('returnTo', normalizedReturnTo);
  const query = params.toString();
  return query ? `${THUMBNAIL_GENERATION_ROOT}?${query}` : THUMBNAIL_GENERATION_ROOT;
}

export function thumbnailGenerationEditHref({
  editCase = 'single',
  extraParams,
  generationId,
  imageUrl,
  mode = 'edit',
  productDescription,
  productName,
  returnTo,
  subjectParams,
}: {
  editCase?: string | null;
  extraParams?: Record<string, string | null | undefined>;
  generationId?: string | null;
  imageUrl?: string | null;
  mode?: string;
  productDescription?: string | null;
  productName?: string | null;
  returnTo?: string | null;
  subjectParams?: ThumbnailSubjectParams;
}): string {
  const params = new URLSearchParams({ mode });
  if (editCase) params.set('editCase', editCase);
  if (subjectParams?.contentWorkspaceId) {
    params.set('contentWorkspaceId', subjectParams.contentWorkspaceId);
  }
  if (!subjectParams?.contentWorkspaceId && subjectParams?.sourceCandidateId) {
    params.set('sourceCandidateId', subjectParams.sourceCandidateId);
  }
  if (generationId) params.set('generationId', generationId);
  if (imageUrl) params.set('imageUrl', imageUrl);
  if (productName) params.set('productName', productName);
  if (productDescription) params.set('productDescription', productDescription);
  if (extraParams) {
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
  }
  const normalizedReturnTo = normalizeProductPipelineReturnTo(returnTo);
  if (normalizedReturnTo) params.set('returnTo', normalizedReturnTo);
  return `${THUMBNAIL_GENERATION_EDIT_ROOT}?${params.toString()}`;
}
