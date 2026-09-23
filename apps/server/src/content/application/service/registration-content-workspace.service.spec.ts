import { describe, expect, it, vi } from 'vitest';
import { ownerTransaction } from '../../../prisma/owner-transaction';
import { RegistrationContentWorkspaceService } from './registration-content-workspace.service';
import type { RegistrationContentWorkspaceRepositoryPort } from '../port/out/repository/registration-content-workspace.repository.port';

const TX = ownerTransaction({} as never);

describe('RegistrationContentWorkspaceService', () => {
  it('resolves exact source selections through the caller transaction', async () => {
    const resolved = {
      selectedThumbnailAssetId: null,
      selectedDetailPageRevisionId: 'revision-1',
    };
    const repository = {
      ensureSalesProductWorkspace: vi.fn(),
      attachToListing: vi.fn(),
      validateSourceSelections: vi.fn(),
      resolveSourceSelections: vi.fn().mockResolvedValue(resolved),
    } as unknown as RegistrationContentWorkspaceRepositoryPort;
    const service = new RegistrationContentWorkspaceService(repository);
    const input = {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailAssetId: null,
      selectedDetailPageRevisionId: null,
    };

    await expect(service.resolveSourceSelections(TX, input)).resolves.toEqual(resolved);
    expect(repository.resolveSourceSelections).toHaveBeenCalledWith(TX, input);
  });

  it('ensures the sales-product draft workspace in the caller transaction', async () => {
    const repository = {
      ensureSalesProductWorkspace: vi.fn().mockResolvedValue({ workspaceId: 'source-workspace-1' }),
      attachToListing: vi.fn(),
      validateSourceSelections: vi.fn().mockResolvedValue(undefined),
    } as unknown as RegistrationContentWorkspaceRepositoryPort;
    const service = new RegistrationContentWorkspaceService(repository);

    await expect(service.ensureSalesProductWorkspace(TX, {
      organizationId: 'org-1',
      salesProductId: 'sales-product-1',
      displayName: ' Kids rain boots ',
      createdByUserId: 'user-1',
    })).resolves.toEqual({ workspaceId: 'source-workspace-1' });
    expect(repository.ensureSalesProductWorkspace).toHaveBeenCalledWith(TX, {
      organizationId: 'org-1',
      salesProductId: 'sales-product-1',
      displayName: 'Kids rain boots',
      normalizedTitle: 'kidsrainboots',
      createdByUserId: 'user-1',
    });
  });

  it('points the draft workspace at its listing through the repository seam', async () => {
    const repository = {
      ensureSalesProductWorkspace: vi.fn(),
      attachToListing: vi.fn().mockResolvedValue({ workspaceId: 'draft-workspace-1' }),
      validateSourceSelections: vi.fn().mockResolvedValue(undefined),
    } as unknown as RegistrationContentWorkspaceRepositoryPort;
    const service = new RegistrationContentWorkspaceService(repository);

    await expect(service.attachToListing(TX, {
      organizationId: 'org-1',
      salesProductId: 'sales-product-1',
      listingId: 'listing-1',
    })).resolves.toEqual({ workspaceId: 'draft-workspace-1' });
    expect(repository.attachToListing).toHaveBeenCalledWith(TX, {
      organizationId: 'org-1',
      salesProductId: 'sales-product-1',
      listingId: 'listing-1',
    });

  });


  it('exposes read-only source-selection validation through the incoming port', async () => {
    const repository = {
      ensureSalesProductWorkspace: vi.fn(),
      attachToListing: vi.fn(),
      validateSourceSelections: vi.fn().mockResolvedValue(undefined),
    } as unknown as RegistrationContentWorkspaceRepositoryPort;
    const service = new RegistrationContentWorkspaceService(repository);
    const input = {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailAssetId: 'asset-1',
      selectedDetailPageRevisionId: 'revision-1',
    };

    await expect(service.validateSourceSelections(TX, input)).resolves.toBeUndefined();
    expect(repository.validateSourceSelections).toHaveBeenCalledWith(TX, input);
  });

  it('allows pre-provider source validation without an ambient transaction', async () => {
    const repository = {
      ensureSalesProductWorkspace: vi.fn(),
      attachToListing: vi.fn(),
      validateSourceSelections: vi.fn().mockResolvedValue(undefined),
    } as unknown as RegistrationContentWorkspaceRepositoryPort;
    const service = new RegistrationContentWorkspaceService(repository);
    const input = {
      organizationId: 'org-1',
      sourceWorkspaceId: 'source-workspace-1',
      selectedThumbnailAssetId: null,
      selectedDetailPageRevisionId: null,
    };

    await expect(service.validateSourceSelections(null, input)).resolves.toBeUndefined();
    expect(repository.validateSourceSelections).toHaveBeenCalledWith(null, input);
  });
});
