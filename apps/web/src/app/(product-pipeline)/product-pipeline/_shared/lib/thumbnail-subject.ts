/**
 * 썸네일 생성의 주인. 콘텐츠 작업공간(판매상품 초안 · 리스팅의 것)에 붙거나 주인 없이 올린다.
 *
 * 작업공간이 아직 없는 판매상품 초안에서 연 편집은 초안 id 를 보내고, 서버가 초안의 작업공간을 찾거나
 * 만들어 붙인다. 작업공간을 알면 작업공간만 보낸다 — 둘을 함께 보내면 서버가 거절한다.
 *
 * 원천 기록(수집상품) id 는 주인이 아니다(KID-310). 서버는 `sourceCandidateId` 필터와 주인을 거절한다.
 */
export type ThumbnailSubject =
  | { kind: 'content-workspace'; contentWorkspaceId: string }
  | { kind: 'sales-product-draft'; salesProductId: string }
  | { kind: 'direct-upload' };

export interface ThumbnailSubjectParams {
  contentWorkspaceId?: string | null;
  salesProductId?: string | null;
}

export function thumbnailSubjectQueryParams(subject: ThumbnailSubject): Record<string, string> {
  const identity = thumbnailSubjectToDtoIdentity(subject);
  if (identity.contentWorkspaceId) return { contentWorkspaceId: identity.contentWorkspaceId };
  if (identity.salesProductId) return { salesProductId: identity.salesProductId };
  return {};
}

export function thumbnailSubjectToDtoIdentity(subject: ThumbnailSubject): {
  contentWorkspaceId: string | null;
  salesProductId: string | null;
} {
  switch (subject.kind) {
    case 'content-workspace':
      return { contentWorkspaceId: subject.contentWorkspaceId, salesProductId: null };
    case 'sales-product-draft':
      return { contentWorkspaceId: null, salesProductId: subject.salesProductId };
    case 'direct-upload':
      return { contentWorkspaceId: null, salesProductId: null };
  }
}

export function thumbnailSubjectFromParams(params: ThumbnailSubjectParams): ThumbnailSubject {
  if (params.contentWorkspaceId) {
    return {
      kind: 'content-workspace',
      contentWorkspaceId: params.contentWorkspaceId,
    };
  }
  if (params.salesProductId) {
    return { kind: 'sales-product-draft', salesProductId: params.salesProductId };
  }
  return { kind: 'direct-upload' };
}
