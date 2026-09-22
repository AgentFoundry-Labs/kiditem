import { describe, expect, it } from 'vitest';
import {
  normalizeThumbnailGenerationListScope,
  resolveThumbnailGenerationSubject,
} from '../thumbnail-generation-subject';

describe('thumbnail generation subject', () => {
  it('reads ownerless editor work as a direct upload', () => {
    expect(resolveThumbnailGenerationSubject({})).toEqual({ contentWorkspaceId: null });
  });

  it('treats a blank workspace id as no workspace at all', () => {
    expect(resolveThumbnailGenerationSubject({ contentWorkspaceId: '   ' })).toEqual({
      contentWorkspaceId: null,
    });
    expect(resolveThumbnailGenerationSubject({ contentWorkspaceId: null })).toEqual({
      contentWorkspaceId: null,
    });
  });

  it('carries the content workspace as the only owner a generation can have', () => {
    expect(resolveThumbnailGenerationSubject({ contentWorkspaceId: ' workspace-1 ' })).toEqual({
      contentWorkspaceId: 'workspace-1',
    });
  });

  it('normalizes generation list scope with workspace-bound as the default', () => {
    expect(normalizeThumbnailGenerationListScope(undefined)).toBe('workspace-bound');
    expect(normalizeThumbnailGenerationListScope('workspace-bound')).toBe('workspace-bound');
    expect(normalizeThumbnailGenerationListScope('direct-upload')).toBe('direct-upload');
    expect(normalizeThumbnailGenerationListScope('all')).toBe('all');
    expect(() => normalizeThumbnailGenerationListScope('product-bound')).toThrow(
      '지원하지 않는 썸네일 생성 조회 범위입니다',
    );
    expect(() => normalizeThumbnailGenerationListScope('collected-product')).toThrow(
      '지원하지 않는 썸네일 생성 조회 범위입니다',
    );
  });
});
