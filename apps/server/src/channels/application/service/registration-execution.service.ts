import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  REGISTRATION_EXECUTION_REPOSITORY_PORT,
  type FrozenRegistrationSubmission,
  type RegistrationExecutionRepositoryPort,
} from '../port/out/repository/registration-execution.repository.port';
import {
  CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT,
  type ChannelsMarketplaceRegistrationCapabilityPort,
} from '../port/in/capability/marketplace-registration.port';
import {
  REGISTRATION_DRAFT_PORT,
  type RegistrationDraftPort,
} from '../port/out/cross-domain/registration-draft.port';
import type { ChannelsRepositoryTransaction } from '../port/out/transaction/repository-transaction';
import type {
  ConfirmRegistrationExecutionInput,
  PrepareWingRegistrationInput,
  PreparedWingRegistration,
  RegistrationExecutionPort,
} from '../port/in/capability/registration-execution.port';

/**
 * 등록 실행 울타리.
 *
 * 채널 계정 하나에 초안 하나를 최대 한 번만 보낸다. 준비(payload 동결) · 시작(리스) ·
 * 확정 · 미해결 · 미제출 종료가 전부 여기를 지난다
 * ([ADR-0014](../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 */
@Injectable()
export class RegistrationExecutionService implements RegistrationExecutionPort {
  constructor(
    @Inject(REGISTRATION_EXECUTION_REPOSITORY_PORT)
    private readonly executions: RegistrationExecutionRepositoryPort,
    @Inject(CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT)
    private readonly registration: ChannelsMarketplaceRegistrationCapabilityPort,
    @Inject(REGISTRATION_DRAFT_PORT)
    private readonly drafts: RegistrationDraftPort,
  ) {}

  cancelUnstartedExecutions(
    tx: ChannelsRepositoryTransaction,
    input: { organizationId: string; sourceCandidateId: string; cancelledAt: Date },
  ): Promise<number> {
    return this.executions.cancelUnstartedExecutions(tx, input);
  }

  async prepareWingRegistration(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    input: PrepareWingRegistrationInput,
  ): Promise<PreparedWingRegistration> {
    const wingProduct = requiredRecord(
      input.registrationInput.wingProduct,
      'registrationInput.wingProduct',
    );
    const listingName = requiredPayloadString(
      wingProduct.sellerProductName ?? wingProduct.productName,
      'registrationInput.wingProduct.sellerProductName',
    );
    const itemName = optionalString(wingProduct.productName);
    const variants = Array.isArray(wingProduct.variants)
      ? wingProduct.variants.map((variant, index) =>
        requiredRecord(variant, `registrationInput.wingProduct.variants[${index}]`))
      : [];
    if (variants.length !== 1) {
      throw new BadRequestException('External WING registration requires exactly one variant.');
    }
    const preflight = await this.registration.preflightExternalProductRegistration({
      organizationId,
      channelAccountId: input.channelAccountId,
      sourceCandidateId: candidateId,
      listingName,
      itemName,
      ...(input.sellpiaInventorySkuId
        ? { selectedSellpiaInventorySkuId: input.sellpiaInventorySkuId }
        : {}),
      ...(input.sellpiaQuantity !== undefined
        ? { selectedQuantity: input.sellpiaQuantity }
        : {}),
    });
    const registrationInput = {
      ...input.registrationInput,
      // Server-derived only. A client-provided value with the same key is overwritten.
      // It lets confirmation reuse an account-scoped listing already present in our
      // synced channel catalog without consulting the Coupang Open API.
      existingChannelListing: preflight.existingListing,
      sellpiaMatch: {
        sellpiaInventorySkuId: preflight.sellpiaMatch.sellpiaInventorySkuId,
        code: preflight.sellpiaMatch.code,
        name: preflight.sellpiaMatch.name,
        optionName: preflight.sellpiaMatch.optionName,
        quantity: preflight.sellpiaMatch.quantity,
      },
      wingProduct: {
        ...wingProduct,
        variants: [{
          ...variants[0],
          vendorItemCode: preflight.sellpiaMatch.code,
        }],
      },
    };
    const operation = await this.executions.prepare({
      organizationId,
      sourceCandidateId: candidateId,
      requestedByUserId: userId,
      channelAccountId: input.channelAccountId,
      displayName: input.displayName,
      registrationInput,
      idempotencyKey: input.idempotencyKey,
      // A miss in our synced channel catalog is not proof of absence in Coupang.
      providerAbsenceVerified: false,
    });
    return {
      ...operation,
      expectedVendorId: operation.expectedProviderAccountId,
      ...preflight,
    };
  }

  previewWingRegistrationMatch(
    organizationId: string,
    candidateId: string,
    input: { listingName: string; itemName?: string },
  ) {
    return this.registration.previewExternalProductRegistrationMatch({
      organizationId,
      sourceCandidateId: candidateId,
      listingName: input.listingName,
      itemName: optionalString(input.itemName),
    });
  }

  startExecution(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    executionId: string,
  ) {
    return this.executions.start({
      organizationId,
      sourceCandidateId: candidateId,
      executionId,
      requestedByUserId: userId,
    });
  }

  getExecution(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    executionId: string,
  ) {
    return this.executions.get({
      organizationId,
      sourceCandidateId: candidateId,
      executionId,
      requestedByUserId: userId,
    });
  }

  markExecutionUnresolved(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    executionId: string,
    evidence: unknown,
  ) {
    return this.executions.markUnresolved({
      organizationId,
      sourceCandidateId: candidateId,
      executionId,
      requestedByUserId: userId,
      evidence,
    });
  }

  markExecutionNotSubmitted(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    executionId: string,
    evidence: unknown,
  ) {
    return this.executions.markNotSubmitted({
      organizationId,
      sourceCandidateId: candidateId,
      executionId,
      requestedByUserId: userId,
      evidence,
    });
  }

  /**
   * 이미 마켓에 등록된 상품을 우리 등록상품으로 확정한다.
   *
   * 쿠팡 WING 등록은 Open API가 아니라 확장이 WING 화면을 직접 조작해 수행한다.
   * 그래서 서버가 provider create를 부르는 경로를 타지 않고, immutable execution과
   * 저장된 ChannelAccount vendorId로 확장 증거를 대조한 뒤 같은 finalize 트랜잭션을
   * 재사용한다.
   *
   * 두 갈래가 이 경로를 쓴다:
   *  - 확장이 자동 제출 후 완료를 관찰하고 등록상품ID를 돌려준 경우
   *  - 사용자가 WING 에서 직접 등록한 뒤 등록상품ID를 입력해 "등록 완료 확인" 한 경우
   *
   * `externalListingId`는 사용자/확장이 주는 값이므로 신뢰 경계다. 선택된 계정의
   * 저장된 vendorId와 확장이 WING 화면에서 확인한 vendorId를 대조한다. 이미 동기화된
   * 리스팅을 찾은 경우에는 frozen 서버 조회 결과를 쓴다. 이 외부 WING 경로는 쿠팡
   * Open API 자격증명을 요구하지 않는다.
   */
  async confirmExecution(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    input: ConfirmRegistrationExecutionInput,
  ): Promise<{ preparationId: string; status: 'registered' | 'failed'; listingId?: string }> {
    const externalListingId = input.externalListingId.trim();
    if (!externalListingId) {
      throw new Error('등록상품ID가 비어 있습니다.');
    }
    let operation = await this.executions.get({
      organizationId, sourceCandidateId: candidateId, executionId: input.executionId,
      requestedByUserId: userId,
    });
    if (operation.status === 'succeeded' && operation.listingId) {
      return { preparationId: operation.preparationId, status: 'registered', listingId: operation.listingId };
    }
    if (operation.status === 'prepared' && operation.providerOutcome === 'not_attempted') {
      // 기본 수동 경로에서는 폼을 채울 때 부작용이 없다. 사용자가 WING에서
      // 등록을 마치고 ID를 제출한 이 시점에만 실행을 uncertain으로 승격한다.
      operation = await this.executions.start({
        organizationId,
        sourceCandidateId: candidateId,
        executionId: input.executionId,
        requestedByUserId: userId,
      });
    }
    if (!['executing', 'reconciling'].includes(operation.status)) {
      throw new Error('External registration must be started before completion.');
    }
    const submission = await this.executions.loadFrozenSubmission(
      organizationId,
      operation.preparationId,
    );
    if (submission.executionId !== input.executionId || submission.channelAccountId === '') {
      throw new Error('External registration execution does not match its frozen preparation.');
    }
    const account = await this.registration.assertExternalProductRegistrationAccount({
      organizationId, channelAccountId: submission.channelAccountId,
    });
    if (account.vendorId !== operation.expectedProviderAccountId) {
      throw new Error('Persisted WING account identity changed after external registration was prepared.');
    }
    const syncedListing = frozenExistingChannelListing(submission.submissionPayloadJson);
    let resultSource: 'synced-channel-listing' | 'coupang-wing-extension';
    let verifiedEvidence: { wingVendorId: string; wingIdentitySource: string } | null;
    if (syncedListing) {
      if (syncedListing.externalListingId !== externalListingId) {
        throw new Error('Synced channel listing does not match the prepared registration.');
      }
      resultSource = 'synced-channel-listing';
      verifiedEvidence = null;
    } else {
      verifiedEvidence = requiredWingExtensionEvidence(input.evidence);
      if (verifiedEvidence.wingVendorId !== operation.expectedProviderAccountId
        || verifiedEvidence.wingVendorId !== account.vendorId) {
        throw new Error('WING extension evidence does not match the prepared registration.');
      }
      resultSource = 'coupang-wing-extension';
    }
    const submissionLeaseToken = submission.submissionLeaseToken;
    if (!submissionLeaseToken) {
      throw new Error('Started external registration is missing its submission lease.');
    }

    try {
      // provider create/read는 부르지 않는다. 확장의 WING 완료 증거 또는 서버가
      // frozen한 내부 동기화 리스팅만 기록한다.
      await this.executions.recordProviderResult(
        organizationId,
        submission.preparationId,
        submissionLeaseToken,
        {
          providerSubmissionId: null,
          externalListingId,
          // The selected persisted ChannelAccount, not browser/client text, owns channel identity.
          channel: account.channel,
          rawResult: {
            source: resultSource,
            confirmedAt: new Date().toISOString(),
            evidence: verifiedEvidence,
            syncedListing,
          },
        },
      );
    } catch (error) {
      return this.fail(organizationId, submission.preparationId, submissionLeaseToken, error);
    }

    try {
      return await this.executions.finalizeRegistered(
        organizationId,
        submission.preparationId,
        submissionLeaseToken,
        async (tx) => {
          const listing = await this.registration.resolveProductRegistration(tx as object, {
            organizationId,
            sourceCandidateId: submission.sourceCandidateId,
            channelAccountId: submission.channelAccountId,
            submissionKey: submission.submissionKey,
            externalListingId,
            displayName: submission.displayName,
          });
          await this.drafts.branchContentToListing(tx, {
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
      return this.fail(organizationId, submission.preparationId, submissionLeaseToken, error);
    }
  }

  private async fail(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
    error: unknown,
    providerOutcome?: 'definitive_failure',
  ): Promise<{ preparationId: string; status: 'failed' }> {
    return this.executions.markFailed({
      organizationId,
      preparationId,
      submissionLeaseToken,
      error: error instanceof Error ? error.message : String(error),
      ...(providerOutcome ? { providerOutcome } : {}),
    });
  }
}

function requiredRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredPayloadString(value: unknown, field: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new BadRequestException(`${field} must be a non-empty string.`);
  return parsed;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const WING_EXTENSION_IDENTITY_SOURCES = new Set([
  'dom:data-vendor-id',
  'meta:vendor-id',
  'url:vendorId',
  'dom:vendor-code-label',
  'dom:inline-script',
]);

function requiredWingExtensionEvidence(
  value: unknown,
): { wingVendorId: string; wingIdentitySource: string } {
  const evidence = asRecord(value);
  const wingVendorId = optionalString(evidence.wingVendorId);
  const wingIdentitySource = optionalString(evidence.wingIdentitySource);
  if (
    !wingVendorId
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(wingVendorId)
    || !wingIdentitySource
    || !WING_EXTENSION_IDENTITY_SOURCES.has(wingIdentitySource)
  ) {
    throw new Error('WING extension evidence is required to confirm a new registration.');
  }
  return { wingVendorId, wingIdentitySource };
}

function frozenExistingChannelListing(value: unknown): {
  externalListingId: string;
  displayName: string;
  status: string | null;
} | null {
  const payload = asRecord(value);
  const registrationInput = asRecord(payload.registrationInput);
  const listing = asRecord(registrationInput.existingChannelListing);
  const externalListingId = optionalString(listing.externalListingId);
  const displayName = optionalString(listing.displayName);
  if (!externalListingId || !displayName) return null;
  return {
    externalListingId,
    displayName,
    status: optionalString(listing.status),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export type { FrozenRegistrationSubmission };
