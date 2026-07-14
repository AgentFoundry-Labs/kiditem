export type ThumbnailGenerationSubjectKind = 'collected-product' | 'content-workspace' | 'direct-upload';

export type ThumbnailGenerationListScope = 'workspace-bound' | 'direct-upload' | 'all';

export interface ThumbnailGenerationSubjectInput {
  sourceCandidateId?: string | null;
  contentWorkspaceId?: string | null;
}

export interface ThumbnailGenerationSubject {
  kind: ThumbnailGenerationSubjectKind;
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

export function classifyThumbnailGenerationSubject(input: ThumbnailGenerationSubjectInput): ThumbnailGenerationSubject {
  const sourceCandidateId = clean(input.sourceCandidateId);
  const contentWorkspaceId = clean(input.contentWorkspaceId);

  if (contentWorkspaceId && sourceCandidateId) {
    throw new ThumbnailGenerationSubjectError('contentWorkspaceId 와 sourceCandidateId 는 동시에 사용할 수 없습니다');
  }

  if (contentWorkspaceId) {
    return {
      kind: 'content-workspace',
      sourceCandidateId,
      contentWorkspaceId,
    };
  }

  if (sourceCandidateId) {
    return {
      kind: 'collected-product',
      sourceCandidateId,
      contentWorkspaceId: null,
    };
  }

  return {
    kind: 'direct-upload',
    sourceCandidateId: null,
    contentWorkspaceId: null,
  };
}

export function normalizeThumbnailGenerationListScope(value: string | null | undefined): ThumbnailGenerationListScope {
  if (!value) return 'workspace-bound';
  if (value === 'workspace-bound' || value === 'direct-upload' || value === 'all') {
    return value;
  }
  throw new ThumbnailGenerationSubjectError('지원하지 않는 썸네일 생성 조회 범위입니다');
}
