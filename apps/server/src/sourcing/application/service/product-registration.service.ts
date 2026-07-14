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
  DefinitiveChannelProductRegistrationError,
  type ChannelProductRegistrationPort,
} from '../port/out/cross-domain/channel-product-registration.port';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrationContentWorkspacePort,
} from '../port/out/cross-domain/registration-content-workspace.port';
import { canStartProviderCreate } from '../../domain/product-preparation-state';

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
      (tx, selections) => this.contentWorkspaces.resolveSourceSelections(tx, selections),
    );
    return { preparationId: result.preparationId, status: 'draft' };
  }

  async updateDraft(
    organizationId: string,
    preparationId: string,
    userId: string | null,
    input: UpdateProductPreparationInput,
  ): Promise<{ preparationId: string; status: 'draft' }> {
    const result = await this.preparations.replaceDraftInput(
      {
        organizationId,
        preparationId,
        userId,
        command: { kind: 'replace', input },
      },
      (tx, selections) => this.contentWorkspaces.resolveSourceSelections(tx, selections),
    );
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
      (tx, selections) => this.contentWorkspaces.resolveSourceSelections(tx, selections),
    );
    if (claim.status === 'registered') return claim;
    const submission = claim;
    const submissionLeaseToken = submission.submissionLeaseToken;
    if (!submissionLeaseToken) {
      throw new Error('Claimed product preparation is missing its submission lease.');
    }

    let providerResult;
    try {
      providerResult = await this.channels.reconcile(this.toSubmissionInput(
        organizationId,
        submission,
      ));
      if (!providerResult) {
        if (!canStartProviderCreate(submission.providerOutcome)) {
          throw new Error('Provider outcome remains uncertain after reconciliation.');
        }
        providerResult = await this.channels.submit(
          this.toSubmissionInput(
            organizationId,
            submission,
            { providerOutcome: 'uncertain', providerCreateAllowed: true },
          ),
          () => this.preparations.markProviderAttemptStarted(
            organizationId,
            preparationId,
            submissionLeaseToken,
          ),
        );
      }
      await this.preparations.recordProviderResult(
        organizationId,
        preparationId,
        submissionLeaseToken,
        providerResult,
      );
    } catch (error) {
      return this.fail(
        organizationId,
        preparationId,
        submissionLeaseToken,
        error,
        error instanceof DefinitiveChannelProductRegistrationError
          ? 'definitive_failure'
          : undefined,
      );
    }

    try {
      return await this.preparations.finalizeRegistered(
        organizationId,
        preparationId,
        submissionLeaseToken,
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
      return this.fail(
        organizationId,
        preparationId,
        submissionLeaseToken,
        error,
      );
    }
  }

  async cancel(
    organizationId: string,
    preparationId: string,
    userId: string | null,
  ): Promise<{ preparationId: string; status: 'cancelled' }> {
    const result = await this.preparations.replaceDraftInput(
      {
        organizationId,
        preparationId,
        userId,
        command: { kind: 'cancel' },
      },
      (tx, selections) => this.contentWorkspaces.resolveSourceSelections(tx, selections),
    );
    if (result.status !== 'cancelled') throw new Error('Preparation cancellation did not complete.');
    return result;
  }

  private toSubmissionInput(
    organizationId: string,
    submission: FrozenProductPreparationSubmission,
    overrides: {
      providerOutcome?: FrozenProductPreparationSubmission['providerOutcome'];
      providerCreateAllowed?: boolean;
    } = {},
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
      providerOutcome: overrides.providerOutcome ?? submission.providerOutcome,
      providerCreateAllowed: overrides.providerCreateAllowed ?? false,
    };
  }

  private async fail(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
    error: unknown,
    providerOutcome?: 'definitive_failure',
  ): Promise<{ preparationId: string; status: 'failed' }> {
    return this.preparations.markFailed({
      organizationId,
      preparationId,
      submissionLeaseToken,
      error: error instanceof Error ? error.message : String(error),
      ...(providerOutcome ? { providerOutcome } : {}),
    });
  }
}
