import { describe, expect, it } from 'vitest';
import {
  thumbnailSubjectFromParams,
  thumbnailSubjectQueryParams,
  thumbnailSubjectToDtoIdentity,
  type ThumbnailSubject,
} from './thumbnail-subject';

describe('ThumbnailSubject identity', () => {
  it('keeps upload-only thumbnail work ownerless', () => {
    const subject: ThumbnailSubject = { kind: 'direct-upload' };

    expect(thumbnailSubjectQueryParams(subject)).toEqual({});
    expect(thumbnailSubjectToDtoIdentity(subject)).toEqual({ contentWorkspaceId: null, salesProductId: null });
  });

  it('attaches workspace-owned thumbnail work to the content workspace', () => {
    const subject: ThumbnailSubject = {
      kind: 'content-workspace',
      contentWorkspaceId: 'workspace-1',
    };

    expect(thumbnailSubjectQueryParams(subject)).toEqual({ contentWorkspaceId: 'workspace-1' });
    expect(thumbnailSubjectToDtoIdentity(subject)).toEqual({ contentWorkspaceId: 'workspace-1', salesProductId: null });
  });

  it('has no candidate-owned subject — a candidate id alone is ownerless work', () => {
    const subject = thumbnailSubjectFromParams({
      ...({ sourceCandidateId: 'candidate-1' } as Record<string, string>),
    });

    expect(subject).toEqual({ kind: 'direct-upload' });
    expect(thumbnailSubjectQueryParams(subject)).toEqual({});
  });

  it('binds work opened from a draft without a workspace to the sales product', () => {
    const subject = thumbnailSubjectFromParams({ salesProductId: 'sales-product-1' });

    expect(subject).toEqual({ kind: 'sales-product-draft', salesProductId: 'sales-product-1' });
    expect(thumbnailSubjectToDtoIdentity(subject)).toEqual({ contentWorkspaceId: null, salesProductId: 'sales-product-1' });
    expect(thumbnailSubjectQueryParams(subject)).toEqual({ salesProductId: 'sales-product-1' });
  });

  it('uses the workspace, never both, when the workspace is already known', () => {
    const subject = thumbnailSubjectFromParams({ contentWorkspaceId: 'workspace-1', salesProductId: 'sales-product-1' });

    expect(thumbnailSubjectToDtoIdentity(subject)).toEqual({ contentWorkspaceId: 'workspace-1', salesProductId: null });
  });
});
