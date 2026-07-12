import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateProductPreparationInput,
  ProductPreparationCommandResult,
  UpdateProductPreparationInput,
} from '@kiditem/shared/sourcing';
import {
  PRODUCT_PREPARATION_REPOSITORY_PORT,
  type FrozenProductPreparationSubmission,
  type ProductPreparationRepositoryPort,
} from '../port/out/repository/product-preparation.repository.port';
import {
  CHANNEL_PRODUCT_REGISTRATION_PORT,
  type ChannelProductRegistrationPort,
} from '../port/out/cross-domain/channel-product-registration.port';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrationContentWorkspacePort,
} from '../port/out/cross-domain/registration-content-workspace.port';

@Injectable()
export class ProductRegistrationService {
  constructor(
    @Inject(PRODUCT_PREPARATION_REPOSITORY_PORT)
    private readonly preparations: ProductPreparationRepositoryPort,
    @Inject(CHANNEL_PRODUCT_REGISTRATION_PORT)
    private readonly channels: ChannelProductRegistrationPort,
    @Inject(REGISTRATION_CONTENT_WORKSPACE_PORT)
    private readonly contentWorkspaces: RegistrationContentWorkspacePort,
  ) {}

  async createDraft(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    input: CreateProductPreparationInput,
  ): Promise<{ preparationId: string; status: 'draft' }> {
    const result = await this.preparations.createOrGetActiveDraft(
      {
        organizationId,
        sourceCandidateId: candidateId,
        createdByUserId: userId,
        input,
      },
      (tx) => this.contentWorkspaces.ensureCandidateWorkspace(tx, {
        organizationId,
        sourceCandidateId: candidateId,
        displayName: input.displayName,
        createdByUserId: userId,
      }),
    );
    return { preparationId: result.preparationId, status: 'draft' };
  }

  async updateDraft(
    organizationId: string,
    preparationId: string,
    userId: string | null,
    input: UpdateProductPreparationInput,
  ): Promise<{ preparationId: string; status: 'draft' }> {
    const result = await this.preparations.replaceDraftInput({
      organizationId,
      preparationId,
      userId,
      command: { kind: 'replace', input },
    });
    if (result.status !== 'draft') throw new Error('Draft replacement did not return a draft.');
    return result;
  }

  async submit(
    organizationId: string,
    preparationId: string,
    userId: string | null,
  ): Promise<ProductPreparationCommandResult> {
    const claim = await this.preparations.claimForSubmission(
      organizationId,
      preparationId,
      userId,
    );
    if (claim.status === 'registered') return claim;
    const submission = claim;

    let providerResult;
    try {
      await this.contentWorkspaces.validateSourceSelections({
        organizationId,
        sourceWorkspaceId: submission.sourceContentWorkspaceId,
        selectedThumbnailUrl: submission.selectedThumbnailUrl,
        selectedThumbnailGenerationId: submission.selectedThumbnailGenerationId,
        selectedThumbnailGenerationCandidateId:
          submission.selectedThumbnailGenerationCandidateId,
        selectedDetailPageArtifactId: submission.selectedDetailPageArtifactId,
        selectedDetailPageRevisionId: submission.selectedDetailPageRevisionId,
        selectedDetailPageGenerationId: submission.selectedDetailPageGenerationId,
      });
      providerResult = await this.channels.reconcile(this.toSubmissionInput(
        organizationId,
        submission,
      ));
      providerResult ??= await this.channels.submit(this.toSubmissionInput(
        organizationId,
        submission,
      ));
      await this.preparations.recordProviderResult(
        organizationId,
        preparationId,
        providerResult,
      );
    } catch (error) {
      return this.fail(organizationId, preparationId, error);
    }

    try {
      return await this.preparations.finalizeRegistered(
        organizationId,
        preparationId,
        async (tx) => {
          const listing = await this.channels.resolveListing(tx, {
            ...this.toSubmissionInput(organizationId, submission),
            externalListingId: providerResult.externalListingId,
            displayName: submission.displayName,
          });
          await this.contentWorkspaces.branchToListing(tx, {
            organizationId,
            sourceWorkspaceId: submission.sourceContentWorkspaceId,
            listingId: listing.listingId,
            displayName: submission.displayName,
            createdByUserId: userId,
            selectedThumbnailUrl: submission.selectedThumbnailUrl,
            selectedThumbnailGenerationId: submission.selectedThumbnailGenerationId,
            selectedThumbnailGenerationCandidateId:
              submission.selectedThumbnailGenerationCandidateId,
            selectedDetailPageArtifactId: submission.selectedDetailPageArtifactId,
            selectedDetailPageRevisionId: submission.selectedDetailPageRevisionId,
            selectedDetailPageGenerationId: submission.selectedDetailPageGenerationId,
          });
          return { listingId: listing.listingId };
        },
      );
    } catch (error) {
      return this.fail(organizationId, preparationId, error);
    }
  }

  async cancel(
    organizationId: string,
    preparationId: string,
    userId: string | null,
  ): Promise<{ preparationId: string; status: 'cancelled' }> {
    const result = await this.preparations.replaceDraftInput({
      organizationId,
      preparationId,
      userId,
      command: { kind: 'cancel' },
    });
    if (result.status !== 'cancelled') throw new Error('Preparation cancellation did not complete.');
    return result;
  }

  private toSubmissionInput(
    organizationId: string,
    submission: FrozenProductPreparationSubmission,
  ) {
    return {
      organizationId,
      preparationId: submission.preparationId,
      sourceCandidateId: submission.sourceCandidateId,
      channelAccountId: submission.channelAccountId,
      submissionKey: submission.submissionKey,
      submissionPayloadHash: submission.submissionPayloadHash,
      submissionPayloadJson: submission.submissionPayloadJson,
      providerSubmissionId: submission.providerSubmissionId,
      registrationResult: submission.registrationResult,
      isRetry: submission.isRetry,
    };
  }

  private async fail(
    organizationId: string,
    preparationId: string,
    error: unknown,
  ): Promise<{ preparationId: string; status: 'failed' }> {
    return this.preparations.markFailed({
      organizationId,
      preparationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
