import { describe, expect, it } from 'vitest';
import {
  thumbnailSubjectQueryParams,
  thumbnailSubjectToDtoIdentity,
  type ThumbnailSubject,
} from './thumbnail-subject';

describe('ThumbnailSubject identity', () => {
  it('passes sourceCandidateId for collected-product thumbnail work', () => {
    const subject: ThumbnailSubject = { kind: 'collected-product', sourceCandidateId: 'candidate-1' };

    expect(thumbnailSubjectQueryParams(subject)).toEqual({
      sourceCandidateId: 'candidate-1',
    });
    expect(thumbnailSubjectToDtoIdentity(subject)).toEqual({
      productId: null,
      sourceCandidateId: 'candidate-1',
      contentWorkspaceId: null,
    });
  });

  it('passes productId for master-product thumbnail work', () => {
    const subject: ThumbnailSubject = { kind: 'master-product', productId: 'product-1' };

    expect(thumbnailSubjectQueryParams(subject)).toEqual({
      productId: 'product-1',
    });
    expect(thumbnailSubjectToDtoIdentity(subject)).toEqual({
      productId: 'product-1',
      sourceCandidateId: null,
      contentWorkspaceId: null,
    });
  });

  it('keeps upload-only thumbnail work ownerless', () => {
    const subject: ThumbnailSubject = { kind: 'direct-upload' };

    expect(thumbnailSubjectQueryParams(subject)).toEqual({});
    expect(thumbnailSubjectToDtoIdentity(subject)).toEqual({
      productId: null,
      sourceCandidateId: null,
      contentWorkspaceId: null,
    });
  });

  it('preserves content workspace identity for registered-product thumbnail work', () => {
    const subject: ThumbnailSubject = {
      kind: 'content-workspace',
      workspaceId: 'workspace-1',
      targetMasterId: null,
      sourceCandidateId: null,
    };

    expect(thumbnailSubjectQueryParams(subject)).toEqual({
      contentWorkspaceId: 'workspace-1',
    });
    expect(thumbnailSubjectToDtoIdentity(subject)).toEqual({
      productId: null,
      sourceCandidateId: null,
      contentWorkspaceId: 'workspace-1',
    });
  });
});
