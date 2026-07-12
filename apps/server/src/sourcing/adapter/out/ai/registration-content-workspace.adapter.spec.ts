import { describe, expect, it, vi } from 'vitest';
import { RegistrationContentWorkspaceAdapter } from './registration-content-workspace.adapter';

describe('RegistrationContentWorkspaceAdapter', () => {
  it('keeps candidate workspace creation and listing branch inside the sourcing transaction', async () => {
    const capability = {
      ensureCandidateWorkspace: vi.fn().mockResolvedValue({ workspaceId: 'source-workspace-1' }),
      branchToListing: vi.fn().mockResolvedValue({ workspaceId: 'listing-workspace-1' }),
      resolveSourceSelections: vi.fn().mockResolvedValue({
        selectedThumbnailUrl: null,
        selectedThumbnailGenerationId: null,
        selectedThumbnailGenerationCandidateId: null,
        selectedDetailPageArtifactId: null,
        selectedDetailPageRevisionId: null,
        selectedDetailPageGenerationId: null,
      }),
    };
    const adapter = new RegistrationContentWorkspaceAdapter(capability as never);
    const tx = { opaque: true } as never;

    await expect(adapter.ensureCandidateWorkspace(tx, {
      organizationId: 'org-1',
      sourceCandidateId: 'candidate-1',
      displayName: 'Kids rain boots',
      createdByUserId: 'user-1',
    })).resolves.toBe('source-workspace-1');
    await adapter.branchToListing(tx, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      listingId: 'listing-1',
      displayName: 'Kids rain boots',
      createdByUserId: 'user-1',
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    });
    await adapter.resolveSourceSelections(tx, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    });

    expect(capability.ensureCandidateWorkspace).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ sourceCandidateId: 'candidate-1' }),
    );
    expect(capability.branchToListing).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ listingId: 'listing-1' }),
    );
    expect(capability.resolveSourceSelections).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ sourceWorkspaceId: 'source-workspace-1' }),
    );
  });
});
