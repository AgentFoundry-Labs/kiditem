export type ThumbnailSubject =
  | { kind: 'collected-product'; sourceCandidateId: string }
  | { kind: 'content-workspace'; contentWorkspaceId: string }
  | { kind: 'direct-upload' };

export interface ThumbnailSubjectParams {
  sourceCandidateId?: string | null;
  contentWorkspaceId?: string | null;
}

export function thumbnailSubjectQueryParams(subject: ThumbnailSubject): Record<string, string> {
  const identity = thumbnailSubjectToDtoIdentity(subject);
  const params: Record<string, string> = {};
  if (identity.contentWorkspaceId) params.contentWorkspaceId = identity.contentWorkspaceId;
  if (identity.sourceCandidateId) params.sourceCandidateId = identity.sourceCandidateId;
  return params;
}

export function thumbnailSubjectToDtoIdentity(subject: ThumbnailSubject): {
  sourceCandidateId: string | null;
  contentWorkspaceId: string | null;
} {
  switch (subject.kind) {
    case 'collected-product':
      return {
        sourceCandidateId: subject.sourceCandidateId,
        contentWorkspaceId: null,
      };
    case 'content-workspace':
      return {
        contentWorkspaceId: subject.contentWorkspaceId,
        sourceCandidateId: null,
      };
    case 'direct-upload':
      return { sourceCandidateId: null, contentWorkspaceId: null };
  }
}

export function thumbnailSubjectFromParams(params: ThumbnailSubjectParams): ThumbnailSubject {
  if (params.contentWorkspaceId) {
    return {
      kind: 'content-workspace',
      contentWorkspaceId: params.contentWorkspaceId,
    };
  }
  if (params.sourceCandidateId)
    return {
      kind: 'collected-product',
      sourceCandidateId: params.sourceCandidateId,
    };
  return { kind: 'direct-upload' };
}
