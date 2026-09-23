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
    expect(thumbnailSubjectToDtoIdentity(subject)).toEqual({ contentWorkspaceId: null });
  });

  it('attaches workspace-owned thumbnail work to the content workspace', () => {
    const subject: ThumbnailSubject = {
      kind: 'content-workspace',
      contentWorkspaceId: 'workspace-1',
    };

    expect(thumbnailSubjectQueryParams(subject)).toEqual({ contentWorkspaceId: 'workspace-1' });
    expect(thumbnailSubjectToDtoIdentity(subject)).toEqual({ contentWorkspaceId: 'workspace-1' });
  });

  it('has no candidate-owned subject — a candidate id alone is ownerless work', () => {
    const subject = thumbnailSubjectFromParams({
      ...({ sourceCandidateId: 'candidate-1' } as Record<string, string>),
    });

    expect(subject).toEqual({ kind: 'direct-upload' });
    expect(thumbnailSubjectQueryParams(subject)).toEqual({});
  });
});
