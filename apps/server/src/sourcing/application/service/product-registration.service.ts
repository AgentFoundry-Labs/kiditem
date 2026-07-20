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
    let submittingProviderCreate = false;
    let providerCreateDispatched = false;
    try {
      providerResult = await this.channels.reconcile(this.toSubmissionInput(
        organizationId,
        submission,
      ));
      if (!providerResult) {
        if (!canStartProviderCreate(submission.providerOutcome)) {
          throw new Error('Provider outcome remains uncertain after reconciliation.');
        }
        submittingProviderCreate = true;
        providerResult = await this.channels.submit(
          this.toSubmissionInput(
            organizationId,
            submission,
            { providerOutcome: 'uncertain', providerCreateAllowed: true },
          ),
          async () => {
            await this.preparations.markProviderAttemptStarted(
              organizationId,
              preparationId,
              submissionLeaseToken,
            );
            providerCreateDispatched = true;
          },
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
          || (submittingProviderCreate && !providerCreateDispatched)
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
            ...kidItemFirstLinks(submission.submissionPayloadJson),
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

  /**
   * 이미 마켓에 등록된 상품을 우리 등록상품으로 확정한다.
   *
   * 쿠팡 WING 등록은 Open API 가 아니라 확장이 WING 화면을 직접 조작해 수행한다.
   * 그래서 서버가 provider create 를 부르는 `submit()` 경로를 탈 수 없다. 대신
   * **이미 발급된 등록상품ID를 근거로** 같은 finalize 트랜잭션(=`ChannelListing` 생성)만
   * 재사용한다. provider 호출은 일어나지 않는다.
   *
   * 두 갈래가 이 경로를 쓴다:
   *  - 확장이 자동 제출 후 완료를 **확증**하고 등록상품ID를 돌려준 경우
   *  - 사용자가 WING 에서 직접 등록한 뒤 등록상품ID를 입력해 "등록됨으로 표시" 한 경우
   *
   * `externalListingId` 는 사용자/확장이 주는 값이므로 신뢰 경계다. 여기서는 형식만
   * 검사하고, 소유권·중복·교차 후보 충돌은 채널의 `resolveListing` 이 판정한다.
   */
  async confirmExternalRegistration(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    input: {
      channelAccountId: string;
      displayName: string;
      externalListingId: string;
      channel?: string;
      evidence?: unknown;
    },
  ): Promise<ProductPreparationCommandResult> {
    const externalListingId = input.externalListingId.trim();
    if (!externalListingId) {
      throw new Error('등록상품ID가 비어 있습니다.');
    }
    const account = await this.channels.assertExternalRegistrationAccount({
      organizationId,
      channelAccountId: input.channelAccountId,
    });

    const draft = await this.preparations.createOrGetActiveDraft(
      {
        organizationId,
        sourceCandidateId: candidateId,
        createdByUserId: userId,
        input: {
          channelAccountId: input.channelAccountId,
          displayName: input.displayName,
          registrationInput: {
            source: 'coupang-wing-extension',
            externalListingId,
            evidence: input.evidence ?? null,
          },
        },
      },
      (tx) => this.contentWorkspaces.ensureCandidateWorkspace(tx, {
        organizationId,
        sourceCandidateId: candidateId,
        displayName: input.displayName,
        createdByUserId: userId,
      }),
      (tx, selections) => this.contentWorkspaces.resolveSourceSelections(tx, selections),
    );

    const claim = await this.preparations.claimForSubmission(
      organizationId,
      draft.preparationId,
      userId,
      (tx, selections) => this.contentWorkspaces.resolveSourceSelections(tx, selections),
    );
    if (claim.status === 'registered') return claim;
    const submission = claim;
    const submissionLeaseToken = submission.submissionLeaseToken;
    if (!submissionLeaseToken) {
      throw new Error('Claimed product preparation is missing its submission lease.');
    }

    try {
      // provider create 를 부르지 않는다. 외부에서 이미 끝난 등록의 결과만 기록한다.
      await this.preparations.recordProviderResult(
        organizationId,
        draft.preparationId,
        submissionLeaseToken,
        {
          providerSubmissionId: null,
          externalListingId,
          // The selected persisted ChannelAccount, not browser/client text, owns channel identity.
          channel: account.channel,
          rawResult: {
            source: 'coupang-wing-extension',
            confirmedAt: new Date().toISOString(),
            evidence: input.evidence ?? null,
          },
        },
      );
    } catch (error) {
      return this.fail(organizationId, draft.preparationId, submissionLeaseToken, error);
    }

    try {
      return await this.preparations.finalizeRegistered(
        organizationId,
        draft.preparationId,
        submissionLeaseToken,
        async (tx) => {
          const listing = await this.channels.resolveListing(tx, {
            ...this.toSubmissionInput(organizationId, submission),
            externalListingId,
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
      return this.fail(organizationId, draft.preparationId, submissionLeaseToken, error);
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
      executionId: submission.executionId,
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

function kidItemFirstLinks(value: unknown): {
  masterProductId?: string;
  optionLinks?: Array<{ externalOptionId: string; productVariantId: string }>;
} {
  const payload = asRecord(value);
  const registrationInput = asRecord(payload.registrationInput);
  const result: {
    masterProductId?: string;
    optionLinks?: Array<{ externalOptionId: string; productVariantId: string }>;
  } = {};
  if (registrationInput.masterProductId !== undefined) {
    result.masterProductId = requiredString(
      registrationInput.masterProductId,
      'KidItem-first masterProductId',
    );
  }
  if (registrationInput.optionLinks !== undefined) {
    if (!Array.isArray(registrationInput.optionLinks)) {
      throw new Error('KidItem-first optionLinks must be an array.');
    }
    result.optionLinks = registrationInput.optionLinks.map((value, index) => {
      const link = asRecord(value);
      return {
        externalOptionId: requiredString(
          link.externalOptionId,
          `KidItem-first optionLinks[${index}].externalOptionId`,
        ),
        productVariantId: requiredString(
          link.productVariantId,
          `KidItem-first optionLinks[${index}].productVariantId`,
        ),
      };
    });
  }
  return result;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}
