import type { OwnerTransaction } from '../../../common/owner-transaction';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type AttachContentWorkspaceToListingInput,
  type EnsureSalesProductContentWorkspaceInput,
  type FindSalesProductContentWorkspaceInput,
  type ImportDetailPageInput,
  type ImportDetailPageResult,
  type RegistrableDetailPage,
  type RegistrationContentSelectionInput,
  type RegistrationContentWorkspacePort,
  type ResolvedRegistrationContentSelections,
} from '../port/in/workspace/registration-content-workspace.port';
import {
  REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT,
  type RegistrationContentWorkspaceRepositoryPort,
} from '../port/out/repository/registration-content-workspace.repository.port';
import { normalizeContentTitle } from './content-workspace.service';
import { extractImageSrcs } from './detail-page-query.service';

@Injectable()
export class RegistrationContentWorkspaceService
  implements RegistrationContentWorkspacePort
{
  readonly registrationContentWorkspacePort = REGISTRATION_CONTENT_WORKSPACE_PORT;

  constructor(
    @Inject(REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT)
    private readonly repository: RegistrationContentWorkspaceRepositoryPort,
  ) {}

  findSalesProductWorkspaceId(
    input: FindSalesProductContentWorkspaceInput,
  ): Promise<string | null> {
    return this.repository.findSalesProductWorkspaceId(input);
  }

  resolveSourceSelections(
    transaction: OwnerTransaction,
    input: RegistrationContentSelectionInput,
  ): Promise<ResolvedRegistrationContentSelections> {
    return this.repository.resolveSourceSelections(transaction, input);
  }

  validateSourceSelections(
    transaction: OwnerTransaction | null,
    input: RegistrationContentSelectionInput,
  ): Promise<void> {
    return this.repository.validateSourceSelections(transaction, input);
  }

  ensureSalesProductWorkspace(
    transaction: OwnerTransaction,
    input: EnsureSalesProductContentWorkspaceInput,
  ): Promise<{ workspaceId: string }> {
    const displayName = normalizedDisplayName(input.displayName);
    return this.repository.ensureSalesProductWorkspace(transaction, {
      ...input,
      displayName,
      normalizedTitle: normalizeContentTitle(displayName),
    });
  }

  readRegistrableDetailPage(input: {
    organizationId: string;
    salesProductId: string;
    revisionId: string | null;
  }): Promise<RegistrableDetailPage | null> {
    return this.repository.readRegistrableDetailPage(input);
  }

  importDetailPage(transaction: OwnerTransaction, input: ImportDetailPageInput): Promise<ImportDetailPageResult> {
    return this.repository.importDetailPage(transaction, {
      ...input,
      imageUrls: extractImageSrcs(input.html),
    });
  }

  attachToListing(
    transaction: OwnerTransaction,
    input: AttachContentWorkspaceToListingInput,
  ): Promise<{ workspaceId: string }> {
    return this.repository.attachToListing(transaction, input);
  }
}

function normalizedDisplayName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!normalized) throw new BadRequestException('Content workspace display name is required.');
  return normalized;
}
