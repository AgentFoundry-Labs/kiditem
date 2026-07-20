import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type BranchRegistrationWorkspaceToListingInput,
  type EnsureRegistrationCandidateWorkspaceInput,
  type FindCandidateContentWorkspaceInput,
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

  findCandidateWorkspaceId(
    input: FindCandidateContentWorkspaceInput,
  ): Promise<string | null> {
    return this.repository.findCandidateWorkspaceId(input);
  }

  resolveSourceSelections(
    transaction: object,
    input: RegistrationContentSelectionInput,
  ): Promise<ResolvedRegistrationContentSelections> {
    return this.repository.resolveSourceSelections(transaction, input);
  }

  validateSourceSelections(
    transaction: object | null,
    input: RegistrationContentSelectionInput,
  ): Promise<void> {
    return this.repository.validateSourceSelections(transaction, input);
  }

  ensureCandidateWorkspace(
    transaction: object,
    input: EnsureRegistrationCandidateWorkspaceInput,
  ): Promise<{ workspaceId: string }> {
    const displayName = normalizedDisplayName(input.displayName);
    return this.repository.ensureCandidateWorkspace(transaction, {
      ...input,
      displayName,
      normalizedTitle: normalizeContentTitle(displayName),
    });
  }

  async branchToListing(
    transaction: object,
    input: BranchRegistrationWorkspaceToListingInput,
  ): Promise<{ workspaceId: string }> {
    if (input.sourceWorkspaceId === input.listingId) {
      throw new BadRequestException('Source workspace and listing owner must be distinct.');
    }
    const displayName = normalizedDisplayName(input.displayName);
    return this.repository.branchToListing(transaction, {
      ...input,
      displayName,
      normalizedTitle: normalizeContentTitle(displayName),
    });
  }
}

function normalizedDisplayName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!normalized) throw new BadRequestException('Content workspace display name is required.');
  return normalized;
}
