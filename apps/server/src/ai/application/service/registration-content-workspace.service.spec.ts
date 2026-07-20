import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RegistrationContentWorkspaceService } from './registration-content-workspace.service';
import type { RegistrationContentWorkspaceRepositoryPort } from '../port/out/repository/registration-content-workspace.repository.port';

const TX = { opaque: true };

describe('RegistrationContentWorkspaceService', () => {
  it('resolves exact source selections through the caller transaction', async () => {
    const resolved = {
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: 'revision-1',
      selectedDetailPageGenerationId: 'generation-1',
    };
    const repository = {
      ensureCandidateWorkspace: vi.fn(),
      branchToListing: vi.fn(),
      validateSourceSelections: vi.fn(),
      resolveSourceSelections: vi.fn().mockResolvedValue(resolved),
    } as unknown as RegistrationContentWorkspaceRepositoryPort;
    const service = new RegistrationContentWorkspaceService(repository);
    const input = {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: 'generation-1',
    };

    await expect(service.resolveSourceSelections(TX, input)).resolves.toEqual(resolved);
    expect(repository.resolveSourceSelections).toHaveBeenCalledWith(TX, input);
  });

  it('ensures the source-candidate workspace in the caller transaction', async () => {
    const repository = {
      ensureCandidateWorkspace: vi.fn().mockResolvedValue({ workspaceId: 'source-workspace-1' }),
      branchToListing: vi.fn(),
      validateSourceSelections: vi.fn().mockResolvedValue(undefined),
    } as unknown as RegistrationContentWorkspaceRepositoryPort;
    const service = new RegistrationContentWorkspaceService(repository);

    await expect(service.ensureCandidateWorkspace(TX, {
      organizationId: 'org-1',
      sourceCandidateId: 'candidate-1',
      displayName: ' Kids rain boots ',
      createdByUserId: 'user-1',
    })).resolves.toEqual({ workspaceId: 'source-workspace-1' });
    expect(repository.ensureCandidateWorkspace).toHaveBeenCalledWith(TX, {
      organizationId: 'org-1',
      sourceCandidateId: 'candidate-1',
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
    });
  });

  it('branches selected source content to the listing without accepting the same owner', async () => {
    const repository = {
      ensureCandidateWorkspace: vi.fn(),
      branchToListing: vi.fn().mockResolvedValue({ workspaceId: 'listing-workspace-1' }),
      validateSourceSelections: vi.fn().mockResolvedValue(undefined),
    } as unknown as RegistrationContentWorkspaceRepositoryPort;
    const service = new RegistrationContentWorkspaceService(repository);

    await expect(service.branchToListing(TX, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      listingId: 'listing-1',
      displayName: 'Kids rain boots',
      createdByUserId: 'user-1',
      selectedThumbnailUrl: 'https://cdn.example.com/thumb.png',
      selectedThumbnailGenerationId: 'generation-1',
      selectedThumbnailGenerationCandidateId: 'candidate-image-1',
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: 'revision-1',
      selectedDetailPageGenerationId: 'detail-generation-1',
    })).resolves.toEqual({ workspaceId: 'listing-workspace-1' });
    expect(repository.branchToListing).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        sourceWorkspaceId: 'source-workspace-1',
        listingId: 'listing-1',
        normalizedTitle: 'kidsrainboots',
      }),
    );

    await expect(service.branchToListing(TX, {
      organizationId: 'org-1',
      sourceWorkspaceId: 'same-id',
      listingId: 'same-id',
      displayName: 'Kids rain boots',
      createdByUserId: null,
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exposes read-only source-selection validation through the incoming port', async () => {
    const repository = {
      ensureCandidateWorkspace: vi.fn(),
      branchToListing: vi.fn(),
      validateSourceSelections: vi.fn().mockResolvedValue(undefined),
    } as unknown as RegistrationContentWorkspaceRepositoryPort;
    const service = new RegistrationContentWorkspaceService(repository);
    const input = {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailUrl: 'https://cdn.example.com/thumb.png',
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: 'revision-1',
      selectedDetailPageGenerationId: 'detail-generation-1',
    };

    await expect(service.validateSourceSelections(TX, input)).resolves.toBeUndefined();
    expect(repository.validateSourceSelections).toHaveBeenCalledWith(TX, input);
  });

  it('allows pre-provider source validation without an ambient transaction', async () => {
    const repository = {
      ensureCandidateWorkspace: vi.fn(),
      branchToListing: vi.fn(),
      validateSourceSelections: vi.fn().mockResolvedValue(undefined),
    } as unknown as RegistrationContentWorkspaceRepositoryPort;
    const service = new RegistrationContentWorkspaceService(repository);
    const input = {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailUrl: null,
      selectedThumbnailGenerationId: null,
      selectedThumbnailGenerationCandidateId: null,
      selectedDetailPageArtifactId: null,
      selectedDetailPageRevisionId: null,
      selectedDetailPageGenerationId: null,
    };

    await expect(service.validateSourceSelections(null, input)).resolves.toBeUndefined();
    expect(repository.validateSourceSelections).toHaveBeenCalledWith(null, input);
  });
});
