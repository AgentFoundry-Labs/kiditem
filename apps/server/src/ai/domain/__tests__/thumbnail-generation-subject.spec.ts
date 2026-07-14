import { describe, expect, it } from 'vitest';
import {
  classifyThumbnailGenerationSubject,
  normalizeThumbnailGenerationListScope,
} from '../thumbnail-generation-subject';

describe('thumbnail generation subject', () => {
  it('classifies ownerless editor work as direct-upload', () => {
    expect(classifyThumbnailGenerationSubject({})).toEqual({
      kind: 'direct-upload',
      sourceCandidateId: null,
      contentWorkspaceId: null,
    });
  });

  it('classifies a content workspace as the canonical owner', () => {
    expect(
      classifyThumbnailGenerationSubject({
        contentWorkspaceId: 'workspace-1',
      }),
    ).toEqual({
      kind: 'content-workspace',
      sourceCandidateId: null,
      contentWorkspaceId: 'workspace-1',
    });
  });

  it('rejects workspace and sourcing candidate owners together', () => {
    expect(() =>
      classifyThumbnailGenerationSubject({
        contentWorkspaceId: 'workspace-1',
        sourceCandidateId: 'candidate-1',
      }),
    ).toThrow('contentWorkspaceId 와 sourceCandidateId 는 동시에 사용할 수 없습니다');
  });

  it('normalizes generation list scope with workspace-bound as the default', () => {
    expect(normalizeThumbnailGenerationListScope(undefined)).toBe('workspace-bound');
    expect(normalizeThumbnailGenerationListScope('workspace-bound')).toBe('workspace-bound');
    expect(normalizeThumbnailGenerationListScope('direct-upload')).toBe('direct-upload');
    expect(normalizeThumbnailGenerationListScope('all')).toBe('all');
    expect(() => normalizeThumbnailGenerationListScope('product-bound')).toThrow(
      '지원하지 않는 썸네일 생성 조회 범위입니다',
    );
    expect(() => normalizeThumbnailGenerationListScope('unknown')).toThrow('지원하지 않는 썸네일 생성 조회 범위입니다');
  });
});
