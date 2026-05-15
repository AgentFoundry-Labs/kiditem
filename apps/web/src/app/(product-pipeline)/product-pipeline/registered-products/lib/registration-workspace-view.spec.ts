import { describe, expect, it } from 'vitest';
import { registrationWorkspaceDetailHref } from './registration-workspace-view';

describe('registrationWorkspaceDetailHref', () => {
  it('keeps source-candidate-backed workspaces inside the registered product route', () => {
    expect(registrationWorkspaceDetailHref({
      id: 'workspace-1',
      sourceCandidateId: 'candidate-1',
    })).toBe('/product-pipeline/registered-products/workspace-1');
  });

  it('keeps ownerless registration workspaces on the registered product workspace route', () => {
    expect(registrationWorkspaceDetailHref({
      id: 'workspace-2',
      sourceCandidateId: null,
    })).toBe('/product-pipeline/registered-products/workspace-2');
  });
});
