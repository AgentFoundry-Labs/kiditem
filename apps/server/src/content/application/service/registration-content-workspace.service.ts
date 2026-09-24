import type { OwnerTransaction } from '../../../common/owner-transaction';
import { Inject, Injectable } from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type CreateManualDetailPageInput,
  type CreateManualDetailPageResult,
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
    return this.repository.ensureSalesProductWorkspace(transaction, input);
  }

  readRegistrableDetailPage(input: {
    organizationId: string;
    salesProductId: string;
    revisionId: string | null;
  }): Promise<RegistrableDetailPage | null> {
    return this.repository.readRegistrableDetailPage(input);
  }

  readRegistrableDetailPages(input: {
    organizationId: string;
    requests: ReadonlyArray<{ salesProductId: string; revisionId: string | null }>;
  }): Promise<ReadonlyMap<string, RegistrableDetailPage>> {
    return this.repository.readRegistrableDetailPages(input);
  }

  importDetailPage(transaction: OwnerTransaction, input: ImportDetailPageInput): Promise<ImportDetailPageResult> {
    return this.repository.importDetailPage(transaction, {
      ...input,
      imageUrls: extractImageSrcs(input.html),
    });
  }

  readImportedDetailImageUrls(input: { organizationId: string }): Promise<ReadonlyMap<string, readonly string[]>> {
    return this.repository.readImportedDetailImageUrls(input);
  }

  rewriteImportedDetailImageUrls(input: {
    organizationId: string;
    salesProductId: string;
    replacements: ReadonlyMap<string, string>;
  }): Promise<{ revisionsUpdated: number }> {
    return this.repository.rewriteImportedDetailImageUrls(input);
  }

  createManualDetailPage(input: CreateManualDetailPageInput): Promise<CreateManualDetailPageResult> {
    if (!input.html.trim()) throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'DETAIL_HTML_REQUIRED' }, message: '상세 HTML 을 넣어 주세요.' });
    return this.repository.createManualDetailPage({ ...input, imageUrls: extractImageSrcs(input.html) });
  }

}
