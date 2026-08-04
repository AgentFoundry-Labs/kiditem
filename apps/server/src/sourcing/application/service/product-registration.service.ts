import { BadRequestException, Inject, Injectable } from '@nestjs/common';
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

  async prepareExternalWingRegistration(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    input: {
      channelAccountId: string;
      displayName: string;
      registrationInput: Record<string, unknown>;
      idempotencyKey: string;
      sellpiaInventorySkuId?: string;
      sellpiaQuantity?: number;
    },
  ) {
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
    const preflight = await this.channels.preflightExternalRegistration({
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
    const operation = await this.preparations.prepareExternalExecution(
      {
        organizationId,
        sourceCandidateId: candidateId,
        requestedByUserId: userId,
        channelAccountId: input.channelAccountId,
        displayName: input.displayName,
        registrationInput,
        idempotencyKey: input.idempotencyKey,
        // A miss in our synced channel catalog is not proof of absence in Coupang.
        providerAbsenceVerified: false,
      },
      (tx) => this.contentWorkspaces.ensureCandidateWorkspace(tx, {
        organizationId,
        sourceCandidateId: candidateId,
        displayName: input.displayName,
        createdByUserId: userId,
      }),
      (tx, selections) => this.contentWorkspaces.resolveSourceSelections(tx, selections),
    );
    return {
      ...operation,
      expectedVendorId: operation.expectedProviderAccountId,
      ...preflight,
    };
  }

  previewExternalWingRegistrationMatch(
    organizationId: string,
    candidateId: string,
    input: { listingName: string; itemName?: string },
  ) {
    return this.channels.previewExternalRegistrationMatch({
      organizationId,
      sourceCandidateId: candidateId,
      listingName: input.listingName,
      itemName: optionalString(input.itemName),
    });
  }

  startExternalWingRegistration(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    executionId: string,
  ) {
    return this.preparations.startExternalExecution({
      organizationId,
      sourceCandidateId: candidateId,
      executionId,
      requestedByUserId: userId,
    });
  }

  markExternalWingRegistrationUnresolved(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    executionId: string,
    evidence: unknown,
  ) {
    return this.preparations.markExternalExecutionUnresolved({
      organizationId,
      sourceCandidateId: candidateId,
      executionId,
      requestedByUserId: userId,
      evidence,
    });
  }

  /**
   * 확장이 폼을 채우다 실패해 마켓에 아무것도 제출되지 않은 경우.
   *
   * 제출 여부를 모르는 실패(`markExternalWingRegistrationUnresolved`)와 달리
   * 중복 등록 위험이 없어 확정 실패로 닫고 재시도를 연다. 기록된 공급자 식별자가
   * 있으면 저장소가 거부하므로 성공한 등록은 이 경로로 뒤집을 수 없다.
   */
  markExternalWingRegistrationNotSubmitted(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    executionId: string,
    evidence: unknown,
  ) {
    return this.preparations.markExternalExecutionNotSubmitted({
      organizationId,
      sourceCandidateId: candidateId,
      executionId,
      requestedByUserId: userId,
      evidence,
    });
  }

  getExternalWingRegistration(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    executionId: string,
  ) {
    return this.preparations.getExternalExecution({
      organizationId,
      sourceCandidateId: candidateId,
      executionId,
      requestedByUserId: userId,
    });
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
          || (
            submission.providerOutcome === 'not_attempted'
            && !providerCreateDispatched
          )
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
   * 쿠팡 WING 등록은 Open API가 아니라 확장이 WING 화면을 직접 조작해 수행한다.
   * 그래서 서버가 provider create를 부르는 `submit()` 경로를 타지 않고,
   * immutable execution과 저장된 ChannelAccount vendorId로 확장 증거를 대조한 뒤
   * 같은 finalize 트랜잭션을 재사용한다.
   *
   * 두 갈래가 이 경로를 쓴다:
   *  - 확장이 자동 제출 후 완료를 관찰하고 등록상품ID를 돌려준 경우
   *  - 사용자가 WING 에서 직접 등록한 뒤 등록상품ID를 입력해 "등록 완료 확인" 한 경우
   *
   * `externalListingId`는 사용자/확장이 주는 값이므로 신뢰 경계다. 선택된 계정의
   * 저장된 vendorId와 확장이 WING 화면에서 확인한 vendorId를
   * 대조한다. 이미 동기화된 리스팅을 찾은 경우에는 frozen 서버 조회 결과를 쓴다.
   * 이 외부 WING 경로는 쿠팡 Open API 자격증명을 요구하지 않는다.
   */
  async confirmExternalRegistration(
    organizationId: string,
    candidateId: string,
    userId: string | null,
    input: {
      executionId: string;
      externalListingId: string;
      evidence?: { wingVendorId: string; wingIdentitySource: string };
    },
  ): Promise<ProductPreparationCommandResult> {
    const externalListingId = input.externalListingId.trim();
    if (!externalListingId) {
      throw new Error('등록상품ID가 비어 있습니다.');
    }
    let operation = await this.preparations.getExternalExecution({
      organizationId, sourceCandidateId: candidateId, executionId: input.executionId,
      requestedByUserId: userId,
    });
    if (operation.status === 'succeeded' && operation.listingId) {
      return { preparationId: operation.preparationId, status: 'registered', listingId: operation.listingId };
    }
    if (operation.status === 'prepared' && operation.providerOutcome === 'not_attempted') {
      // 기본 수동 경로에서는 폼을 채울 때 부작용이 없다. 사용자가 WING에서
      // 등록을 마치고 ID를 제출한 이 시점에만 실행을 uncertain으로 승격한다.
      operation = await this.preparations.startExternalExecution({
        organizationId,
        sourceCandidateId: candidateId,
        executionId: input.executionId,
        requestedByUserId: userId,
      });
    }
    if (!['executing', 'reconciling'].includes(operation.status)) {
      throw new Error('External registration must be started before completion.');
    }
    const submission = await this.preparations.loadFrozenSubmission(
      organizationId,
      operation.preparationId,
    );
    if (submission.executionId !== input.executionId || submission.channelAccountId === '') {
      throw new Error('External registration execution does not match its frozen preparation.');
    }
    const account = await this.channels.assertExternalRegistrationAccount({
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
      await this.preparations.recordProviderResult(
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
      return await this.preparations.finalizeRegistered(
        organizationId,
        submission.preparationId,
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
      return this.fail(organizationId, submission.preparationId, submissionLeaseToken, error);
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

function kidItemFirstLinks(value: unknown): {
  masterProductId?: string;
  optionLinks?: Array<{
    externalOptionId: string;
    sellpiaInventorySkuId: string;
    quantity: number;
  }>;
} {
  const payload = asRecord(value);
  const registrationInput = asRecord(payload.registrationInput);
  const result: {
    masterProductId?: string;
    optionLinks?: Array<{
      externalOptionId: string;
      sellpiaInventorySkuId: string;
      quantity: number;
    }>;
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
        sellpiaInventorySkuId: requiredString(
          link.sellpiaInventorySkuId,
          `KidItem-first optionLinks[${index}].sellpiaInventorySkuId`,
        ),
        quantity: requiredPositiveInteger(
          link.quantity,
          `KidItem-first optionLinks[${index}].quantity`,
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

function requiredPositiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return Number(value);
}
