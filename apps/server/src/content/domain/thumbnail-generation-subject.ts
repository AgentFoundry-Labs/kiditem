export type ThumbnailGenerationListScope = 'workspace-bound' | 'direct-upload' | 'all';

export interface ThumbnailGenerationSubjectInput {
  contentWorkspaceId?: string | null;
  /** 초안에서 여는 편집. 요청 경계에서 초안의 작업공간으로 바뀐다 — 생성의 주인은 여전히 작업공간 하나다. */
  salesProductId?: string | null;
}

/**
 * A thumbnail generation has exactly one possible owner: its content workspace.
 * Everything else — the sales product the workspace belongs to, the listing it
 * was branched into, the sourcing candidate the images came from — is reachable
 * from that workspace, so the request never carries a second owner id.
 */
export interface ThumbnailGenerationSubject {
  contentWorkspaceId: string | null;
  salesProductId: string | null;
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

export function resolveThumbnailGenerationSubject(
  input: ThumbnailGenerationSubjectInput,
): ThumbnailGenerationSubject {
  const contentWorkspaceId = clean(input.contentWorkspaceId);
  const salesProductId = clean(input.salesProductId);
  if (contentWorkspaceId && salesProductId) {
    throw new ThumbnailGenerationSubjectError('contentWorkspaceId 와 salesProductId 는 함께 보낼 수 없습니다');
  }
  return { contentWorkspaceId, salesProductId };
}

export function normalizeThumbnailGenerationListScope(value: string | null | undefined): ThumbnailGenerationListScope {
  if (!value) return 'workspace-bound';
  if (value === 'workspace-bound' || value === 'direct-upload' || value === 'all') {
    return value;
  }
  throw new ThumbnailGenerationSubjectError('지원하지 않는 썸네일 생성 조회 범위입니다');
}
