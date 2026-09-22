import type { OwnerTransaction } from '../../../common/owner-transaction';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type AttachContentWorkspaceToListingInput,
  type EnsureSalesProductContentWorkspaceInput,
  type FindSalesProductContentWorkspaceInput,
  type RegistrationContentSelectionInput,
  type RegistrationContentWorkspacePort,
  type ResolvedRegistrationContentSelections,
} from '../port/in/workspace/registration-content-workspace.port';
import {
  REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT,
  type RegistrationContentWorkspaceRepositoryPort,
} from '../port/out/repository/registration-content-workspace.repository.port';
import { normalizeContentTitle } from './content-workspace.service';

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

  async attachToListing(
    transaction: OwnerTransaction,
    input: AttachContentWorkspaceToListingInput,
  ): Promise<{ workspaceId: string }> {
    if (input.salesProductId === input.listingId) {
      throw new BadRequestException('Sales product and listing owner must be distinct.');
    }
    return this.repository.attachToListing(transaction, input);
  }
}

function normalizedDisplayName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!normalized) throw new BadRequestException('Content workspace display name is required.');
  return normalized;
}
