import { describe, expect, it } from 'vitest';
import {
  getGenerateFormValidation,
  getGenerateSourceReferences,
  getLoadedContentWorkspaceId,
  resolveGenerateOwnerInputs,
} from './useGenerateForm';

describe('getGenerateFormValidation', () => {
  it('requires at least one product image before generation', () => {
    expect(getGenerateFormValidation({ rawTitle: '자석 다트게임', imageCount: 0 })).toEqual({
      isValid: false,
      message: '상품 이미지를 최소 1장 추가해 주세요.',
    });
  });

  it('allows generation when title and one image are present', () => {
    expect(getGenerateFormValidation({ rawTitle: '자석 다트게임', imageCount: 1 })).toEqual({
      isValid: true,
      message: null,
    });
  });
});

describe('getGenerateSourceReferences', () => {
  it('reads sourcing candidates from generate query params without duplicating the target product as a source', () => {
    const params = new URLSearchParams(
      'sourceCandidateId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&sourceCandidateIds=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    );

    expect(
      getGenerateSourceReferences(params, '22222222-2222-4222-8222-222222222222'),
    ).toEqual([
      {
        sourceType: 'sourcing_candidate',
        sourceCandidateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      {
        sourceType: 'sourcing_candidate',
        sourceCandidateId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
    ]);
  });
});

describe('getLoadedContentWorkspaceId', () => {
  it('keeps generation attached to the loaded duplicate workspace when the normalized title still matches', () => {
    expect(
      getLoadedContentWorkspaceId(
        {
          status: 'loaded',
          checkedTitle: 'QA Detail Panel 1778840622275',
          workspaceId: '77777777-7777-4777-8777-888888888888',
          workspaceTitle: 'QA Detail Panel 1778840622275',
        },
        'QA   Detail Panel 1778840622275',
      ),
    ).toBe('77777777-7777-4777-8777-888888888888');
  });

  it('does not attach to a loaded workspace after the user changes the title to another product', () => {
    expect(
      getLoadedContentWorkspaceId(
        {
          status: 'loaded',
          checkedTitle: 'QA Detail Panel 1778840622275',
          workspaceId: '77777777-7777-4777-8777-888888888888',
          workspaceTitle: 'QA Detail Panel 1778840622275',
        },
        'Another Detail Panel',
      ),
    ).toBeNull();
  });
});

describe('resolveGenerateOwnerInputs', () => {
  it('ignores owner query params in sandbox-only mode', () => {
    const params = new URLSearchParams(
      'productId=master-1&sourceCandidateId=candidate-1&contentWorkspaceId=workspace-1&title=%EC%83%81%ED%92%88',
    );

    expect(resolveGenerateOwnerInputs(params, 'sandbox-only')).toEqual({
      productId: null,
      initialTitle: '',
      initialContentWorkspaceId: null,
      sourceReferences: [],
      primarySourceCandidateId: null,
    });
  });

  it('keeps owner query params in allow-url mode', () => {
    const params = new URLSearchParams(
      'productId=master-1&sourceCandidateId=candidate-1&contentWorkspaceId=workspace-1&title=%EC%83%81%ED%92%88',
    );

    expect(resolveGenerateOwnerInputs(params, 'allow-url')).toEqual({
      productId: 'master-1',
      initialTitle: '상품',
      initialContentWorkspaceId: 'workspace-1',
      sourceReferences: [{
        sourceType: 'sourcing_candidate',
        sourceCandidateId: 'candidate-1',
      }],
      primarySourceCandidateId: 'candidate-1',
    });
  });
});
