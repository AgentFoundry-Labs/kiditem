import { describe, expect, it } from 'vitest';
import { contentWorkspaceDetailHref } from './content-workspace-view';

describe('contentWorkspaceDetailHref', () => {
  it('keeps source-candidate-backed workspaces inside the registered product route', () => {
    expect(contentWorkspaceDetailHref({
      id: 'workspace-1',
      sourceCandidateId: 'candidate-1',
    })).toBe('/product-pipeline/registered-products/workspace-1');
  });

  it('keeps ownerless content workspaces on the registered product workspace route', () => {
    expect(contentWorkspaceDetailHref({
      id: 'workspace-2',
      sourceCandidateId: null,
    })).toBe('/product-pipeline/registered-products/workspace-2');
  });
});
