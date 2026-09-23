import { STOCKOUT_CHECK_PORT, type StockoutCheckPort } from '../../port/in/listing/stockout-check.port';
import type { PrepareListingAvailabilityInput, ReportListingAvailabilityInput } from '@kiditem/shared/sales-product';
import { ChannelInputError as BadRequestException } from '../../../domain/exception/channel-business-error';
import { SALES_PRODUCT_PORT, type SalesProductPort } from '../../port/in/sales-product.port';
import { REGISTRATION_TARGET_PORT, type RegistrationTargetPort } from '../../port/in/registration-target.port';
import { RegistrationTargetException } from '../../exception/registration-target.exception';
import { preparedRegistrationRecipe } from '../../../domain/registration/registration-item-code';
import {
  REGISTRATION_EXECUTION_REPOSITORY_PORT,
  type FrozenRegistrationSubmission,
  type RegistrationExecutionRepositoryPort,
} from '../../port/out/repository/registration-execution.repository.port';
import {
  CHANNEL_REGISTRATION_PORT,
  type ChannelRegistrationPort,
} from '../../port/in/registration/channel-registration.port';
import {
  REGISTRATION_DRAFT_PORT,
  type RegistrationDraftPort,
} from '../../port/out/persistence/registration-draft.port';
import type { PrepareTargetExecutionInput, ReportTargetExecutionInput, TargetExecutionSnapshot } from '@kiditem/shared/sales-product';
import type { ChannelsRepositoryTransaction } from '../../port/out/transaction/repository-transaction';
import type {
  ConfirmRegistrationExecutionInput,
  PrepareWingRegistrationInput,
  PreparedWingRegistration,
  RegistrationExecutionPort,
} from '../../port/in/capability/registration-execution.port';

/**
 * 등록 실행 울타리.
 *
 * 재사용 등록 대상의 실행마다 제출 내용을 동결한다. 같은 요청의 재전송은
 * 기존 실행을 반환하고, 시작·확정·미해결·미제출 종료가 이 계약을 통과한다
 * ([ADR-0014](../../../../../../../docs/adr/0014-channels-owns-the-registration-execution-fence.md)).
 */

export class RegistrationExecutionService implements RegistrationExecutionPort {
  constructor(

    private readonly executions: RegistrationExecutionRepositoryPort,

    private readonly registration: ChannelRegistrationPort,

    private readonly drafts: RegistrationDraftPort,
     private readonly salesProducts: SalesProductPort,
     private readonly targets: RegistrationTargetPort,
     private readonly stockout: StockoutCheckPort,
  ) {}

  prepareListingAvailability(organizationId: string, userId: string | null, input: PrepareListingAvailabilityInput) {
    return this.executions.prepareListingAvailability({ organizationId, requestedByUserId: userId, request: input });
  }
  listListingAvailability(organizationId: string, userId: string | null, channelAccountId: string, externalListingId: string) {
    return this.executions.listListingAvailability({ organizationId, requestedByUserId: userId, channelAccountId, externalListingId });
  }
  startListingAvailability(organizationId: string, userId: string | null, executionId: string) {
    return this.executions.startListingAvailability({ organizationId, requestedByUserId: userId, executionId,
      assertInventoryStockout: (transaction, snapshot) => this.stockout.assertEligible(transaction, organizationId, snapshot, executionId) });
  }
  reportListingAvailability(organizationId: string, userId: string | null, executionId: string, input: ReportListingAvailabilityInput) {
    return this.executions.reportListingAvailability({ organizationId, requestedByUserId: userId, executionId, report: input });
  }

  async prepareTargetExecution(organizationId: string, targetId: string, userId: string | null, input: PrepareTargetExecutionInput) {
    if (input.kind !== 'register' && !input.channelListingId) {
      throw new RegistrationTargetException('invalid', '기존 쇼핑몰 상품을 선택하세요.');
    }
    if ((input.kind === 'update') !== Boolean(input.updateFields?.length)) {
      throw new RegistrationTargetException('invalid', '가격 수정 실행은 변경할 판매가 항목을 지정해야 합니다.');
    }
    const transitions = input.optionTransitions ?? [];
    if (input.kind === 'composition_change' ? transitions.length === 0 : transitions.length > 0) {
      throw new RegistrationTargetException('invalid', '구성 전환에는 변경할 쇼핑몰 옵션과 새 판매옵션을 지정해야 합니다.');
    }
    if (new Set(transitions.map(item => item.channelListingOptionId)).size !== transitions.length
      || new Set(transitions.map(item => item.salesProductOptionId)).size !== transitions.length) {
      throw new RegistrationTargetException('invalid', '구성 전환 옵션을 중복 지정할 수 없습니다.');
    }
    const replay = await this.executions.findTargetReplay({ organizationId, requestedByUserId: userId, targetId, request: input });
    if (replay) return replay;
    const target = await this.targets.get(organizationId, targetId);
    if (target.version !== input.expectedVersion) throw new RegistrationTargetException('conflict', '등록 설정이 변경됐습니다. 다시 불러오세요.');
    const product = await this.salesProducts.get(organizationId, target.salesProductId);
    if (target.selectedOptions.length === 0) throw new RegistrationTargetException('invalid', '실행할 옵션을 선택하세요.');
    const options = new Map(product.options.map(option => [option.id, option]));
    if (transitions.some(item => !target.selectedOptions.some(option => option.salesProductOptionId === item.salesProductOptionId))) {
      throw new RegistrationTargetException('invalid', '새 판매옵션이 등록 대상에 선택되어 있지 않습니다.');
    }
    if (input.kind === 'update') {
      const listing = product.channelListings.find(item => item.id === input.channelListingId
        && item.channelAccountId === target.channelAccountId);
      const optionId = listing?.options.length === 1 ? listing.options[0]?.salesProductOptionId : null;
      const selection = target.selectedOptions.find(item => item.salesProductOptionId === optionId);
      const option = optionId ? options.get(optionId) : undefined;
      if (!listing || !selection || !option) {
        throw new RegistrationTargetException('invalid', '가격 수정은 등록 대상에 선택된 단일 옵션의 몰 상품만 지원합니다.');
      }
      const price = selection.salePrice ?? option.salePrice;
      if (price === null || !['kakao', 'kidsnote'].includes(listing.mallKey) || price < 10 || price > 10_000_000) {
        throw new RegistrationTargetException('invalid', '이 몰 또는 판매가는 현재 가격 전송 범위에 포함되지 않습니다.');
      }
    }
    const snapshot: TargetExecutionSnapshot = {
      targetId, targetVersion: target.version, channelAccountId: target.channelAccountId,
      kind: input.kind, channelListingId: input.channelListingId ?? null,
      ...(input.updateFields ? { updateFields: input.updateFields } : {}),
      ...(input.adapterDefaults ? { adapterDefaults: input.adapterDefaults } : {}),
      ...(input.adapterValues ? { adapterValues: input.adapterValues } : {}),
      applyCompositionTemplate: input.applyCompositionTemplate,
      optionTransitions: transitions,
      product: {
        ...product, name: target.displayName ?? product.name,
        // Target-specific values are already resolved below and in registrationInput.
        // The account summary must never override a frozen option price a second time.
        channelOverrides: [],
        options: target.selectedOptions.map(selection => {
          const option = options.get(selection.salesProductOptionId);
          if (!option) throw new RegistrationTargetException('invalid', '선택한 옵션이 해당 판매상품에 없습니다.');
          return { ...option, salePrice: selection.salePrice ?? option.salePrice, normalPrice: selection.normalPrice ?? option.normalPrice };
        }),
      },
      registrationInput: target.registrationInput,
      supplyPrices: target.selectedOptions.map(selection => ({ salesProductOptionId: selection.salesProductOptionId, supplyPrice: selection.supplyPrice })),
    };
    return this.executions.prepareTarget({ organizationId, requestedByUserId: userId, request: input, snapshot });
  }

  startTargetExecution(organizationId: string, executionId: string, userId: string | null) {
    return this.executions.startTarget({ organizationId, executionId, requestedByUserId: userId });
  }
  listTargetExecutions(organizationId: string, targetId: string, userId: string | null) {
    return this.executions.listTarget({ organizationId, targetId, requestedByUserId: userId });
  }

  getTargetExecution(organizationId: string, executionId: string, userId: string | null) {
    return this.executions.getTarget({ organizationId, executionId, requestedByUserId: userId });
  }
  reportTargetExecution(organizationId: string, executionId: string, userId: string | null, input: ReportTargetExecutionInput) {
    return this.executions.reportTarget({ organizationId, executionId, requestedByUserId: userId, report: input });
  }

  async prepareWingRegistration(
    organizationId: string,
    salesProductId: string,
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
      channelListingOptionId: salesProductId,
      listingName,
      itemName,
      ...(input.sellpiaInventorySkuId
        ? { selectedSellpiaInventorySkuId: input.sellpiaInventorySkuId }
        : {}),
      ...(input.sellpiaQuantity !== undefined
        ? { selectedQuantity: input.sellpiaQuantity }
        : {}),
    });
    const clientInput = { ...input.registrationInput };
    delete clientInput.kidItemCode;
    const registrationInput = {
      ...clientInput,
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
      salesProductId,
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
      sellpiaMatch: { ...preflight.sellpiaMatch, code: operation.kidItemCode ?? preflight.sellpiaMatch.code },
    };
  }

  previewWingRegistrationMatch(
    organizationId: string,
    salesProductId: string,
    input: { listingName: string; itemName?: string },
  ) {
    return this.registration.previewExternalProductRegistrationMatch({
      organizationId,
      channelListingOptionId: salesProductId,
      listingName: input.listingName,
      itemName: optionalString(input.itemName),
    });
  }

  startExecution(
    organizationId: string,
    salesProductId: string,
    userId: string | null,
    executionId: string,
  ) {
    return this.executions.start({
      organizationId,
      salesProductId,
      executionId,
      requestedByUserId: userId,
    });
  }

  getExecution(
    organizationId: string,
    salesProductId: string,
    userId: string | null,
    executionId: string,
  ) {
    return this.executions.get({
      organizationId,
      salesProductId,
      executionId,
      requestedByUserId: userId,
    });
  }

  markExecutionUnresolved(
    organizationId: string,
    salesProductId: string,
    userId: string | null,
    executionId: string,
    evidence: unknown,
  ) {
    return this.executions.markUnresolved({
      organizationId,
      salesProductId,
      executionId,
      requestedByUserId: userId,
      evidence,
    });
  }

  markExecutionNotSubmitted(
    organizationId: string,
    salesProductId: string,
    userId: string | null,
    executionId: string,
    evidence: unknown,
  ) {
    return this.executions.markNotSubmitted({
      organizationId,
      salesProductId,
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
    salesProductId: string,
    userId: string | null,
    input: ConfirmRegistrationExecutionInput,
  ): Promise<{ preparationId: string; status: 'registered' | 'failed'; listingId?: string }> {
    const externalListingId = input.externalListingId.trim();
    if (!externalListingId) {
      throw new Error('등록상품ID가 비어 있습니다.');
    }
    let operation = await this.executions.get({
      organizationId, salesProductId, executionId: input.executionId,
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
        salesProductId,
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
      input.executionId,
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
        submission.executionId,
      );
    } catch (error) {
      return this.fail(organizationId, submission.preparationId, submissionLeaseToken, error, submission.executionId);
    }

    try {
      return await this.executions.finalizeRegistered(
        organizationId,
        submission.preparationId,
        submissionLeaseToken,
        async (tx) => {
          const listing = await this.registration.resolveProductRegistration(tx, {
            organizationId,
            salesProductId: submission.salesProductId,
            channelAccountId: submission.channelAccountId,
            submissionKey: submission.submissionKey,
            preparedRecipe: preparedRegistrationRecipe(submission.submissionPayloadJson) ?? undefined,
            externalListingId,
            displayName: submission.displayName,
          });
          // 콘텐츠 작업공간이 없는 초안(직접 작성)은 분기할 것이 없다.
          if (submission.sourceContentWorkspaceId) await this.drafts.branchContentToListing(tx, {
            organizationId,
            salesProductId: submission.salesProductId,
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
        submission.executionId,
      );
    } catch (error) {
      return this.fail(organizationId, submission.preparationId, submissionLeaseToken, error, submission.executionId);
    }
  }

  private async fail(
    organizationId: string,
    preparationId: string,
    submissionLeaseToken: string,
    error: unknown,
    executionId: string,
    providerOutcome?: 'definitive_failure',
  ): Promise<{ preparationId: string; status: 'failed' }> {
    return this.executions.markFailed({
      executionId,
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
