/**
 * 썸네일 생성의 주인. 콘텐츠 작업공간(판매상품 초안 · 리스팅의 것)에 붙거나 주인 없이 올린다.
 *
 * 원천 기록(수집상품) id 는 주인이 아니다 — 수집상품 화면의 썸네일은 그 판매상품 초안의 작업공간에
 * 붙는다(KID-310). 서버는 `sourceCandidateId` 필터와 주인을 거절한다.
 */
export type ThumbnailSubject =
  | { kind: 'content-workspace'; contentWorkspaceId: string }
  | { kind: 'direct-upload' };

export interface ThumbnailSubjectParams {
  contentWorkspaceId?: string | null;
}

export function thumbnailSubjectQueryParams(subject: ThumbnailSubject): Record<string, string> {
  const identity = thumbnailSubjectToDtoIdentity(subject);
  return identity.contentWorkspaceId ? { contentWorkspaceId: identity.contentWorkspaceId } : {};
}

export function thumbnailSubjectToDtoIdentity(subject: ThumbnailSubject): {
  contentWorkspaceId: string | null;
} {
  switch (subject.kind) {
    case 'content-workspace':
      return { contentWorkspaceId: subject.contentWorkspaceId };
    case 'direct-upload':
      return { contentWorkspaceId: null };
  }
}

export function thumbnailSubjectFromParams(params: ThumbnailSubjectParams): ThumbnailSubject {
  if (params.contentWorkspaceId) {
    return {
      kind: 'content-workspace',
      contentWorkspaceId: params.contentWorkspaceId,
    };
  }
  return { kind: 'direct-upload' };
}
