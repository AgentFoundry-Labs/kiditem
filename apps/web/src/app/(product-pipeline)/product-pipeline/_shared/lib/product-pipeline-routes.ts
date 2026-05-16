import type { ThumbnailSubjectParams } from './thumbnail-subject';

export const PRODUCT_PIPELINE_ROOT = '/product-pipeline';
export const COLLECTED_PRODUCTS_ROOT = `${PRODUCT_PIPELINE_ROOT}/collected-products`;
export const REGISTERED_PRODUCTS_ROOT = `${PRODUCT_PIPELINE_ROOT}/registered-products`;
export const DETAIL_PAGE_EDITOR_ROOT = `${PRODUCT_PIPELINE_ROOT}/detail-pages`;
export const PRODUCT_GENERATION_ROOT = `${PRODUCT_PIPELINE_ROOT}/productgenerate`;
export const DETAIL_TEMPLATE_GENERATION_ROOT = `${PRODUCT_PIPELINE_ROOT}/detailgenerate`;
export const THUMBNAIL_AI_ROOT = `${PRODUCT_PIPELINE_ROOT}/thumbnail-ai`;
export const THUMBNAIL_GENERATION_ROOT = `${PRODUCT_PIPELINE_ROOT}/thumbnail-generation`;
export const THUMBNAIL_GENERATION_EDIT_ROOT = `${THUMBNAIL_GENERATION_ROOT}/edit`;

export function collectedProductDetailHref(candidateId: string): string {
  return `${COLLECTED_PRODUCTS_ROOT}/${encodeURIComponent(candidateId)}`;
}

export function registeredProductDetailHref(workspaceId: string): string {
  return `${REGISTERED_PRODUCTS_ROOT}/${encodeURIComponent(workspaceId)}`;
}

export function collectedProductEditorHref({
  candidateId,
  generationId,
}: {
  candidateId: string;
  generationId?: string | null;
}): string {
  const href = `${collectedProductDetailHref(candidateId)}/editor`;
  if (!generationId) return href;
  const params = new URLSearchParams({ generationId });
  return `${href}?${params.toString()}`;
}

export function registeredProductEditorHref(generationId: string): string {
  return `${DETAIL_PAGE_EDITOR_ROOT}/${encodeURIComponent(generationId)}/editor`;
}

export function detailPageEditorHref({
  candidateId,
  generationId,
  returnTo,
}: {
  candidateId?: string | null;
  generationId?: string | null;
  returnTo?: string | null;
}): string {
  if (candidateId) {
    if (!generationId) return collectedProductEditorHref({ candidateId });
    const params = new URLSearchParams({ sourceCandidateId: candidateId });
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
  registrationWorkspaceId,
  returnTo,
  title,
}: {
  registrationWorkspaceId?: string | null;
  returnTo?: string | null;
  title?: string | null;
} = {}): string {
  const params = new URLSearchParams();
  if (registrationWorkspaceId) params.set('registrationWorkspaceId', registrationWorkspaceId);
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
  if (subjectParams?.registrationWorkspaceId) {
    params.set('registrationWorkspaceId', subjectParams.registrationWorkspaceId);
  }
  if (subjectParams?.productId) params.set('productId', subjectParams.productId);
  if (!subjectParams?.productId && subjectParams?.sourceCandidateId) {
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
  if (subjectParams?.registrationWorkspaceId) {
    params.set('registrationWorkspaceId', subjectParams.registrationWorkspaceId);
  }
  if (subjectParams?.productId) params.set('productId', subjectParams.productId);
  if (!subjectParams?.productId && subjectParams?.sourceCandidateId) {
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
