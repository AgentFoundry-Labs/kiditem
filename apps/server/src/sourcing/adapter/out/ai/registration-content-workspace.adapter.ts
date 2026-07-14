import { Inject, Injectable } from '@nestjs/common';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT as AI_REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrationContentWorkspacePort as AiRegistrationContentWorkspacePort,
} from '../../../../ai/application/port/in/workspace/registration-content-workspace.port';
import type {
  BranchRegistrationContentWorkspaceInput,
  EnsureCandidateContentWorkspaceInput,
  RegistrationContentWorkspacePort,
  ResolvedRegistrationContentSelections,
  ValidateRegistrationContentSelectionsInput,
} from '../../../application/port/out/cross-domain/registration-content-workspace.port';
import type { SourcingRepositoryTransaction } from '../../../application/port/out/transaction/repository-transaction';

@Injectable()
export class RegistrationContentWorkspaceAdapter
  implements RegistrationContentWorkspacePort
{
  constructor(
    @Inject(AI_REGISTRATION_CONTENT_WORKSPACE_PORT)
    private readonly workspaces: AiRegistrationContentWorkspacePort,
  ) {}

  resolveSourceSelections(
    transaction: SourcingRepositoryTransaction,
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
    transaction: SourcingRepositoryTransaction,
    input: EnsureCandidateContentWorkspaceInput,
  ): Promise<string> {
    const result = await this.workspaces.ensureCandidateWorkspace(transaction, input);
    return result.workspaceId;
  }

  branchToListing(
    transaction: SourcingRepositoryTransaction,
    input: BranchRegistrationContentWorkspaceInput,
  ): Promise<{ workspaceId: string }> {
    return this.workspaces.branchToListing(transaction, input);
  }
}
