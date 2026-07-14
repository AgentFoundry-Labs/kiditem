export type ThumbnailSubject =
  | { kind: 'collected-product'; sourceCandidateId: string }
  | { kind: 'master-product'; productId: string }
  | {
      kind: 'content-workspace';
      workspaceId: string;
    }
  | { kind: 'direct-upload' };

export interface ThumbnailSubjectParams {
  productId?: string | null;
  sourceCandidateId?: string | null;
  contentWorkspaceId?: string | null;
}

export function thumbnailSubjectQueryParams(subject: ThumbnailSubject): Record<string, string> {
  const identity = thumbnailSubjectToDtoIdentity(subject);
  const params: Record<string, string> = {};
  if (identity.contentWorkspaceId) params.contentWorkspaceId = identity.contentWorkspaceId;
  if (identity.productId) params.productId = identity.productId;
  if (identity.sourceCandidateId) params.sourceCandidateId = identity.sourceCandidateId;
  return params;
}

export function thumbnailSubjectToDtoIdentity(
  subject: ThumbnailSubject,
): { productId: string | null; sourceCandidateId: string | null; contentWorkspaceId: string | null } {
  switch (subject.kind) {
    case 'collected-product':
      return { productId: null, sourceCandidateId: subject.sourceCandidateId, contentWorkspaceId: null };
    case 'master-product':
      return { productId: subject.productId, sourceCandidateId: null, contentWorkspaceId: null };
    case 'content-workspace':
      return {
        contentWorkspaceId: subject.workspaceId,
        productId: null,
        sourceCandidateId: null,
      };
    case 'direct-upload':
      return { productId: null, sourceCandidateId: null, contentWorkspaceId: null };
  }
}

export function thumbnailSubjectFromParams(params: ThumbnailSubjectParams): ThumbnailSubject {
  if (params.contentWorkspaceId) {
    return {
      kind: 'content-workspace',
      workspaceId: params.contentWorkspaceId,
    };
  }
  if (params.productId) return { kind: 'master-product', productId: params.productId };
  if (params.sourceCandidateId) return { kind: 'collected-product', sourceCandidateId: params.sourceCandidateId };
  return { kind: 'direct-upload' };
}
