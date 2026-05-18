export type ThumbnailGenerationSubjectKind =
  | 'master-product'
  | 'collected-product'
  | 'content-workspace'
  | 'direct-upload';

export type ThumbnailGenerationListScope = 'product-bound' | 'direct-upload' | 'all';

export interface ThumbnailGenerationSubjectInput {
  productId?: string | null;
  sourceCandidateId?: string | null;
  contentWorkspaceId?: string | null;
}

export interface ThumbnailGenerationSubject {
  kind: ThumbnailGenerationSubjectKind;
  productId: string | null;
  sourceCandidateId: string | null;
  contentWorkspaceId: string | null;
}

export class ThumbnailGenerationSubjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThumbnailGenerationSubjectError';
  }
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function classifyThumbnailGenerationSubject(
  input: ThumbnailGenerationSubjectInput,
): ThumbnailGenerationSubject {
  const productId = clean(input.productId);
  const sourceCandidateId = clean(input.sourceCandidateId);
  const contentWorkspaceId = clean(input.contentWorkspaceId);

  if (productId && sourceCandidateId) {
    throw new ThumbnailGenerationSubjectError(
      'productId 와 sourceCandidateId 는 동시에 사용할 수 없습니다',
    );
  }

  if (contentWorkspaceId) {
    return {
      kind: 'content-workspace',
      productId,
      sourceCandidateId,
      contentWorkspaceId,
    };
  }

  if (productId) {
    return {
      kind: 'master-product',
      productId,
      sourceCandidateId: null,
      contentWorkspaceId: null,
    };
  }

  if (sourceCandidateId) {
    return {
      kind: 'collected-product',
      productId: null,
      sourceCandidateId,
      contentWorkspaceId: null,
    };
  }

  return {
    kind: 'direct-upload',
    productId: null,
    sourceCandidateId: null,
    contentWorkspaceId: null,
  };
}

export function normalizeThumbnailGenerationListScope(
  value: string | null | undefined,
): ThumbnailGenerationListScope {
  if (!value) return 'product-bound';
  if (value === 'product-bound' || value === 'direct-upload' || value === 'all') {
    return value;
  }
  throw new ThumbnailGenerationSubjectError('지원하지 않는 썸네일 생성 조회 범위입니다');
}
