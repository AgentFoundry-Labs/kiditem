import { describe, expect, it } from 'vitest';
import {
  classifyThumbnailGenerationSubject,
  normalizeThumbnailGenerationListScope,
} from '../thumbnail-generation-subject';

describe('thumbnail generation subject', () => {
  it('classifies ownerless editor work as direct-upload', () => {
    expect(classifyThumbnailGenerationSubject({})).toEqual({
      kind: 'direct-upload',
      productId: null,
      sourceCandidateId: null,
      contentWorkspaceId: null,
    });
  });

  it('keeps workspace identity while preserving the nested owner', () => {
    expect(classifyThumbnailGenerationSubject({
      contentWorkspaceId: 'workspace-1',
      sourceCandidateId: 'candidate-1',
    })).toEqual({
      kind: 'content-workspace',
      productId: null,
      sourceCandidateId: 'candidate-1',
      contentWorkspaceId: 'workspace-1',
    });
  });

  it('rejects product and sourcing candidate owners together', () => {
    expect(() =>
      classifyThumbnailGenerationSubject({
        productId: 'product-1',
        sourceCandidateId: 'candidate-1',
      }),
    ).toThrow('productId 와 sourceCandidateId 는 동시에 사용할 수 없습니다');
  });

  it('normalizes generation list scope with product-bound as the default', () => {
    expect(normalizeThumbnailGenerationListScope(undefined)).toBe('product-bound');
    expect(normalizeThumbnailGenerationListScope('direct-upload')).toBe('direct-upload');
    expect(normalizeThumbnailGenerationListScope('all')).toBe('all');
    expect(() => normalizeThumbnailGenerationListScope('unknown')).toThrow(
      '지원하지 않는 썸네일 생성 조회 범위입니다',
    );
  });
});
