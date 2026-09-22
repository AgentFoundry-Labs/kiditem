import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { Inject, Injectable } from '@nestjs/common';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT as AI_REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrationContentWorkspacePort as AiRegistrationContentWorkspacePort,
} from '../../../../ai/application/port/in/workspace/registration-content-workspace.port';
import type {
  BranchRegistrationContentWorkspaceInput,
  EnsureCandidateContentWorkspaceInput,
  FindCandidateContentWorkspaceInput,
  RegistrationContentWorkspacePort,
  ResolvedRegistrationContentSelections,
  ValidateRegistrationContentSelectionsInput,
} from '../../../application/port/in/registration-content-workspace.port';

@Injectable()
export class RegistrationContentWorkspaceAdapter
  implements RegistrationContentWorkspacePort
{
  constructor(
    @Inject(AI_REGISTRATION_CONTENT_WORKSPACE_PORT)
    private readonly workspaces: AiRegistrationContentWorkspacePort,
  ) {}

  findCandidateWorkspaceId(
    input: FindCandidateContentWorkspaceInput,
  ): Promise<string | null> {
    return this.workspaces.findCandidateWorkspaceId(input);
  }

  resolveSourceSelections(
    transaction: OwnerTransaction,
    input: ValidateRegistrationContentSelectionsInput,
  ): Promise<ResolvedRegistrationContentSelections> {
    return this.workspaces.resolveSourceSelections(transaction, input);
  }

  validateSourceSelections(
    input: ValidateRegistrationContentSelectionsInput,
  ): Promise<void> {
    return this.workspaces.validateSourceSelections(null, input);
  }

  async ensureCandidateWorkspace(
    transaction: OwnerTransaction,
    input: EnsureCandidateContentWorkspaceInput,
  ): Promise<string> {
    const result = await this.workspaces.ensureCandidateWorkspace(transaction, input);
    return result.workspaceId;
  }

  branchToListing(
    transaction: OwnerTransaction,
    input: BranchRegistrationContentWorkspaceInput,
  ): Promise<{ workspaceId: string }> {
    return this.workspaces.branchToListing(transaction, input);
  }
}
