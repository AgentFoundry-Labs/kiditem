export type ThumbnailSubject =
  | { kind: 'collected-product'; sourceCandidateId: string }
  | { kind: 'master-product'; productId: string }
  | {
      kind: 'registration-workspace';
      workspaceId: string;
      targetMasterId?: string | null;
      sourceCandidateId?: string | null;
    }
  | { kind: 'direct-upload' };

export interface ThumbnailSubjectParams {
  productId?: string | null;
  sourceCandidateId?: string | null;
}

export function thumbnailSubjectQueryParams(subject: ThumbnailSubject): Record<string, string> {
  const identity = thumbnailSubjectToDtoIdentity(subject);
  const params: Record<string, string> = {};
  if (identity.productId) params.productId = identity.productId;
  if (identity.sourceCandidateId) params.sourceCandidateId = identity.sourceCandidateId;
  return params;
}

export function thumbnailSubjectToDtoIdentity(
  subject: ThumbnailSubject,
): { productId: string | null; sourceCandidateId: string | null } {
  switch (subject.kind) {
    case 'collected-product':
      return { productId: null, sourceCandidateId: subject.sourceCandidateId };
    case 'master-product':
      return { productId: subject.productId, sourceCandidateId: null };
    case 'registration-workspace':
      return {
        productId: subject.targetMasterId ?? null,
        sourceCandidateId: subject.targetMasterId ? null : subject.sourceCandidateId ?? null,
      };
    case 'direct-upload':
      return { productId: null, sourceCandidateId: null };
  }
}

export function thumbnailSubjectFromParams(params: ThumbnailSubjectParams): ThumbnailSubject {
  if (params.productId) return { kind: 'master-product', productId: params.productId };
  if (params.sourceCandidateId) {
    return { kind: 'collected-product', sourceCandidateId: params.sourceCandidateId };
  }
  return { kind: 'direct-upload' };
}
