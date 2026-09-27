import {
  KiditemConflictError,
  KiditemInvalidValueError,
  KiditemNotFoundError,
} from '@kiditem/shared/errors';
import {
  channelListingLockKey,
  externalListingLockKey,
  parseRegistrationPayload,
  registrationTargetLockKey,
  REGISTRATION_EVIDENCE_CHUNK_KIND,
  REGISTRATION_FILL_CHUNK_KIND,
  REGISTRATION_KIND,
  RegistrationDocumentPayloadSchema,
  RegistrationEvidenceSchema,
  RegistrationFillSchema,
  RegistrationPlanSchema,
  RegistrationResultSchema,
  RegistrationScopeSchema,
  type RegistrationCloseRequest,
  type RegistrationConfirmRequest,
  type RegistrationEvidence,
  type RegistrationFill,
  type RegistrationMallOutcome,
  type RegistrationPlan,
  type RegistrationResult,
  type RegistrationScope,
} from '@kiditem/shared/channels-operations';
import {
  accountLockKey,
  resourceLockKey,
  type OperationLockKey,
  type OperationPlanResult,
  type OperationStagedChunk,
  type OperationView,
} from '@kiditem/shared/operation';
import type { OperationPort } from '../../../../common/operation/application/port/in/operation.port';
import type { RegistrationFinalizeContext, RegistrationOperationPort } from '../../port/in/registration-operation.port';
import type { SalesProductPort } from '../../port/in/sales-product.port';
import type { RegistrationTargetPort } from '../../port/in/registration-target.port';
import type { ChannelsThumbnailExecutionPort } from '../../port/in/thumbnail-execution.port';
import type { ChannelRegistrableDetailPagePort } from '../../port/out/content/registrable-detail-page.port';
import type { ChannelRegistrableThumbnailPort } from '../../port/out/content/registrable-thumbnail.port';
import type { ChannelAdapterRegistryPort } from '../../port/out/channel/channel-adapter.port';
import type { ChannelIntegrityPort } from '../../port/out/integrity/channel-integrity.port';
import type {
  RegistrationConfirmationEvidence,
  RegistrationOperationRepositoryPort,
  TargetExecutionIntent,
} from '../../port/out/repository/registration-operation.repository.port';
import { freezeProductRegistrationPayload, type RegistrationSubmissionJson } from '../../../domain/registration/registration-submission-payload';
import { getListingAvailabilityCapability } from '../../../domain/registration/mall-adapter-manifest';
import { observedOptionConfirms } from '../../../domain/registration/availability-confirmation';
import { registrationSubmitAllowed } from '../../../domain/registration/registration-submit-gate';
import { MALL_ADMIN_LISTING_STATUS } from '../../../domain/collection/mall-admin-listings';

/** 운영자가 몰에 없다고 닫은 등록 실행의 오류 코드(KID-218). */
export const REGISTRATION_NOT_FOUND_ON_MALL_CODE = 'CHANNELS_REGISTRATION_NOT_FOUND_ON_MALL' as const;

/** 운영자 확인으로 적는 리스팅 상태 — 몰 관리자 목록이 접는 글자와 같다. */
const OPERATOR_SOLD_OUT_STATUS = MALL_ADMIN_LISTING_STATUS.soldOut;
const OPERATOR_RESUMED_STATUS = MALL_ADMIN_LISTING_STATUS.selling;

const DOCUMENT_KINDS = new Set(['register', 'update', 'composition_change']);
const EMPTY_FILL: RegistrationFill = { steps: [], warnings: [], manualSteps: [], dialogs: [] };

/**
 * 몰 등록 실행 kind `channels.registration` 의 owner 서비스(KID-364). 옛 등록 실행 울타리의 준비 · 시작 · 결과 보고를
 * plan · finalize 로 옮겼다. executionKind 는 plan 안 필드이고, 겹침은 잠금 키 셋이 막는다(대상 · 리스팅 · 외부 리스팅,
 * 품절 · 재개는 계정 + 리스팅마다, 대표이미지는 판매 상품).
 */
export class RegistrationOperationService implements RegistrationOperationPort {
  constructor(
    private readonly repository: RegistrationOperationRepositoryPort,
    private readonly salesProducts: SalesProductPort,
    private readonly targets: RegistrationTargetPort,
    /** 몰에 보낼 상세는 Content revision 에서 읽어 plan 에 얼린다(KID-313 W2). */
    private readonly detailPages: ChannelRegistrableDetailPagePort,
    /** 몰에 보낼 대표이미지 자산도 plan 순간 Content 에서 읽어 얼린다(KID-313 W3a). */
    private readonly thumbnails: ChannelRegistrableThumbnailPort,
    private readonly thumbnailExecutions: ChannelsThumbnailExecutionPort,
    private readonly adapters: ChannelAdapterRegistryPort,
    private readonly integrity: ChannelIntegrityPort,
    private readonly operations: OperationPort,
  ) {}

  async plan(rawScope: Record<string, unknown>, context: { organizationId: string; userId: string | null }): Promise<OperationPlanResult> {
    const parsed = RegistrationScopeSchema.safeParse(rawScope);
    if (!parsed.success) throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'REQUEST_INVALID' }, cause: parsed.error });
    const scope = parsed.data;
    const { organizationId } = context;
    switch (scope.executionKind) {
      case 'sold_out':
      case 'resume':
        return this.planAvailability(organizationId, scope, scope.executionKind);
      case 'thumbnail_update':
        return this.planThumbnail(organizationId, scope);
      default:
        return scope.registrationTargetId ? this.planTarget(organizationId, scope) : this.planQuickRegister(organizationId, scope);
    }
  }

  private freeze(payload: Record<string, unknown>): { payload: Record<string, unknown>; hash: string } {
    const frozen = freezeProductRegistrationPayload(
      JSON.parse(JSON.stringify(payload)) as RegistrationSubmissionJson,
      (value) => this.integrity.sha256(value),
    );
    return { payload: frozen.payload as Record<string, unknown>, hash: frozen.hash };
  }

  private result(plan: Omit<RegistrationPlan, 'payloadHash' | 'payload' | 'startedAt'>, payload: Record<string, unknown>, lockKeys: OperationLockKey[]): OperationPlanResult {
    const frozen = this.freeze(payload);
    parseRegistrationPayload(plan.executionKind, frozen.payload);
    const registrationPlan: RegistrationPlan = RegistrationPlanSchema.parse({
      ...plan,
      payloadHash: frozen.hash,
      payload: frozen.payload,
      startedAt: new Date().toISOString(),
    });
    return { plan: registrationPlan, lockKeys };
  }

  /** register · update · composition_change: 옛 `prepareTargetExecution` 의 입력 규칙 + 저장소의 준비 · 시작 확인. */
  private async planTarget(organizationId: string, scope: RegistrationScope): Promise<OperationPlanResult> {
    const kind = scope.executionKind as 'register' | 'update' | 'composition_change';
    const targetId = scope.registrationTargetId!;
    if (scope.expectedVersion === undefined) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '등록 대상의 버전을 함께 보내야 합니다.' });
    }
    if (kind !== 'register' && !scope.channelListingId) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '기존 쇼핑몰 상품을 선택하세요.' });
    }
    if ((kind === 'update') !== Boolean(scope.updateFields?.length)) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '가격 수정 실행은 변경할 판매가 항목을 지정해야 합니다.' });
    }
    const transitions = scope.optionTransitions ?? [];
    if (kind === 'composition_change' ? transitions.length === 0 : transitions.length > 0) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '구성 전환에는 변경할 쇼핑몰 옵션과 새 판매옵션을 지정해야 합니다.' });
    }
    if (new Set(transitions.map((item) => item.channelListingOptionId)).size !== transitions.length
      || new Set(transitions.map((item) => item.salesProductOptionId)).size !== transitions.length) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '구성 전환 옵션을 중복 지정할 수 없습니다.' });
    }
    const target = await this.targets.get(organizationId, targetId);
    if (target.version !== scope.expectedVersion) throw new KiditemConflictError('CHANNELS_REGISTRATION_TARGET_STALE');
    const product = await this.salesProducts.get(organizationId, target.salesProductId);
    if (target.selectedOptions.length === 0) throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '실행할 옵션을 선택하세요.' });
    const options = new Map(product.options.map((option) => [option.id, option]));
    if (transitions.some((item) => !target.selectedOptions.some((option) => option.salesProductOptionId === item.salesProductOptionId))) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '새 판매옵션이 등록 대상에 선택되어 있지 않습니다.' });
    }
    if (kind === 'update') {
      const listing = product.channelListings.find((item) => item.id === scope.channelListingId && item.channelAccountId === target.channelAccountId);
      const optionId = listing?.options.length === 1 ? listing.options[0]?.salesProductOptionId : null;
      const selection = target.selectedOptions.find((item) => item.salesProductOptionId === optionId);
      const option = optionId ? options.get(optionId) : undefined;
      if (!listing || !selection || !option) {
        throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '가격 수정은 등록 대상에 선택된 단일 옵션의 몰 상품만 지원합니다.' });
      }
      // 가격은 판매 상품 옵션 한 곳에만 있다(KID-313 W2).
      const price = option.salePrice;
      if (price === null || !['kakao', 'kidsnote'].includes(listing.mallKey) || price < 10 || price > 10_000_000) {
        throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '이 몰 또는 판매가는 현재 가격 전송 범위에 포함되지 않습니다.' });
      }
    }
    const sendsDocument = kind === 'register' || kind === 'composition_change';
    const detail = sendsDocument
      ? await this.detailPages.read({ organizationId, salesProductId: target.salesProductId, selectedDetailPageRevisionId: target.selectedDetailPageRevisionId })
      : null;
    const representative = sendsDocument
      ? await this.thumbnails.find({ organizationId, salesProductId: target.salesProductId, selectedThumbnailAssetId: target.selectedThumbnailAssetId })
      : null;
    const intent: TargetExecutionIntent = {
      targetId, targetVersion: target.version, channelAccountId: target.channelAccountId,
      kind, channelListingId: scope.channelListingId ?? null,
      ...(scope.updateFields ? { updateFields: scope.updateFields } : {}),
      ...(scope.adapterDefaults ? { adapterDefaults: scope.adapterDefaults } : {}),
      ...(scope.adapterValues ? { adapterValues: scope.adapterValues } : {}),
      applyCompositionTemplate: scope.applyCompositionTemplate ?? false,
      optionTransitions: transitions,
      // 이름 · 가격은 판매 상품 그대로다 — 얼리는 것은 API 가 내보내는 JSON 그대로다(Date 는 ISO 문자열).
      product: JSON.parse(JSON.stringify({
        ...product,
        channelOverrides: [],
        options: target.selectedOptions.map((selection) => {
          const option = options.get(selection.salesProductOptionId);
          if (!option) throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '선택한 옵션이 해당 판매상품에 없습니다.' });
          return option;
        }),
      })),
      detailPage: detail ? { revisionId: detail.revisionId, html: detail.html } : null,
      representativeImage: representative ? { assetId: representative.assetId, url: representative.image.url } : null,
      registrationInput: target.registrationInput,
    };
    const planned = await this.repository.planTarget({ organizationId, intent, expectedVersion: scope.expectedVersion });
    // 몰별 폼 지시의 최종본은 서버가 만든다: 웹 폼 위에 채널 어댑터의 얼린 값을 덮는다(2026-09-27 리더 결정).
    const form = this.adapters.get(planned.mallKey).freezeForm(scope.form ?? null, planned.snapshot.adapterPayload);
    const lockKeys: OperationLockKey[] = [registrationTargetLockKey(targetId)];
    if (planned.snapshot.channelListingId) lockKeys.push(channelListingLockKey(planned.snapshot.channelListingId));
    if (planned.externalListingId) lockKeys.push(externalListingLockKey(target.channelAccountId, planned.externalListingId));
    return this.result({
      executionKind: kind,
      mallKey: planned.mallKey,
      channelAccountId: target.channelAccountId,
      registrationTargetId: targetId,
      salesProductId: target.salesProductId,
      channelListingId: planned.snapshot.channelListingId,
      externalListingId: planned.externalListingId,
      expectedProviderAccountId: planned.expectedProviderAccountId,
      // 가격 보내기(update)는 [등록]이 아니다 — 품절 · 재개처럼 요청이 곧 동작이라 문서 관문을 거치지 않는다.
      submit: kind === 'update' ? scope.submit : scope.submit && registrationSubmitAllowed(planned.mallKey),
    }, { snapshot: planned.snapshot, form }, lockKeys);
  }

  /** 빠른 등록: 등록 대상 없이 수집 상품을 몰 폼에 채우기만 한다(제출 없음, 잠금은 계정 하나). */
  private async planQuickRegister(organizationId: string, scope: RegistrationScope): Promise<OperationPlanResult> {
    if (!scope.channelAccountId) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '폼을 채울 몰 계정을 고르세요.' });
    }
    const account = await this.repository.readActiveAccount(organizationId, scope.channelAccountId);
    // 판매 상품 초안에서 연 빠른 등록은 그 상품을 plan 에 남긴다(조직 확인 — 없으면 404). 수집 상품 출처(`sourceProductId`)는 plan 칸이 없다.
    if (scope.salesProductId) await this.salesProducts.get(organizationId, scope.salesProductId);
    const form = this.adapters.get(account.channel).freezeForm(scope.form ?? null, {});
    return this.result({
      executionKind: 'register',
      mallKey: account.channel,
      channelAccountId: account.id,
      registrationTargetId: null,
      salesProductId: scope.salesProductId ?? null,
      channelListingId: null,
      externalListingId: null,
      expectedProviderAccountId: account.expectedProviderAccountId,
      submit: false,
    }, { snapshot: null, form }, [accountLockKey(account.id)]);
  }

  /** 품절 · 재개: 몰 계정 하나의 리스팅 묶음(옛 일괄 품절과 같은 실행 하나). */
  private async planAvailability(organizationId: string, scope: RegistrationScope, action: 'sold_out' | 'resume'): Promise<OperationPlanResult> {
    const planned = await this.repository.planAvailability({
      organizationId,
      channelAccountId: scope.channelAccountId!,
      action,
      items: scope.items!,
    });
    return this.result({
      executionKind: action,
      mallKey: planned.account.channel,
      channelAccountId: planned.account.id,
      registrationTargetId: null,
      salesProductId: null,
      channelListingId: null,
      externalListingId: null,
      expectedProviderAccountId: planned.account.expectedProviderAccountId,
      // 품절 · 재개는 등록 관문을 쓰지 않는다 — 요청이 곧 동작이다(온채널처럼 승인 요청인 몰도 요청을 보내는 것이 이 실행의 일).
      submit: scope.submit,
    }, { action, listings: planned.listings }, [
      accountLockKey(planned.account.id),
      ...planned.listings.map((listing) => channelListingLockKey(listing.channelListingId)),
    ]);
  }

  /** 대표이미지: 사진 하나를 몰 상품 수정 화면에 넣는다. [저장]은 누르지 않으므로 제출이 아니다. */
  private async planThumbnail(organizationId: string, scope: RegistrationScope): Promise<OperationPlanResult> {
    const salesProductId = scope.salesProductId!;
    const planned = await this.thumbnailExecutions.plan({
      organizationId,
      salesProductId,
      ...(scope.assetId ? { assetId: scope.assetId } : {}),
      ...(scope.channelListingId ? { channelListingId: scope.channelListingId } : {}),
    });
    const account = await this.repository.readActiveAccount(organizationId, planned.channelAccountId);
    return this.result({
      executionKind: 'thumbnail_update',
      mallKey: account.channel,
      channelAccountId: account.id,
      registrationTargetId: null,
      salesProductId,
      channelListingId: planned.payload.channelListingId,
      externalListingId: planned.payload.externalListingId,
      expectedProviderAccountId: account.expectedProviderAccountId,
      submit: false,
    }, { ...planned.payload }, [resourceLockKey('sales-product', salesProductId)]);
  }

  /**
   * 성공 종료(확장 finish succeeded, 또는 운영자 확인). 제출한 등록 대상 문서면 증거를 확인하고 리스팅 · 옵션 · 레시피를 같은
   * 트랜잭션에 반영한다 — 제출했는데 몰 상품 id 가 없으면 거절(`PROVIDER_LISTING_MISSING`). 제출하지 않은 문서(`submitted: false`
   * 또는 `mallOutcome: not_submitted`, 빠른 등록 포함)는 폼만 채운 것이라 원장에 쓰지 않는다. 품절 · 재개 · 대표이미지도 실행의
   * 성공이 사실이다.
   */
  async finalize(chunks: OperationStagedChunk[], context: RegistrationFinalizeContext): Promise<Record<string, unknown>> {
    const plan = RegistrationPlanSchema.parse(context.plan);
    const reported = context.result ?? {};
    const reportedFill = RegistrationFillSchema.safeParse(reported.fill);
    const fill = chunks.some((chunk) => chunk.chunkKind === REGISTRATION_FILL_CHUNK_KIND) || !reportedFill.success ? readFill(chunks) : reportedFill.data;
    const evidences = readEvidences(chunks, plan);
    const chunkEvidence = evidences.length === 1 ? evidences[0]! : null;
    const operator = readOperatorConfirmation(reported);
    const base = {
      submitted: typeof reported.submitted === 'boolean' ? reported.submitted : plan.submit,
      submitSkipped: typeof reported.submitSkipped === 'string' ? reported.submitSkipped : null,
      mallMessage: typeof reported.mallMessage === 'string' ? reported.mallMessage : null,
      fill,
    };
    // 폼만 채움(빠른 등록, 또는 ADR-0019 관문이 [등록]을 거른 문서 · 품절 · 재개 실행): 증거도 원장 쓰기도 없고 대상은 미등록,
    // 리스팅은 그대로 남는다.
    const availability = plan.executionKind === 'sold_out' || plan.executionKind === 'resume';
    const fillOnly = (DOCUMENT_KINDS.has(plan.executionKind) || availability) && operator === null
      && ((DOCUMENT_KINDS.has(plan.executionKind) && plan.registrationTargetId === null)
        || reported.submitted === false || reported.mallOutcome === 'not_submitted');
    if (fillOnly) {
      return registrationResult({
        ...base,
        submitted: false,
        providerOutcome: 'not_attempted',
        mallOutcome: 'not_submitted',
        externalListingId: null,
        evidence: chunkEvidence,
        channelListingId: null,
      });
    }
    // 몰에 제출했지만 확정되지 않은 결과(submitted · uncertain · awaiting_approval)는 finish `reconciling` 으로 와야 한다.
    if (operator === null && reported.submitted === true && reported.mallOutcome !== undefined && reported.mallOutcome !== 'confirmed') {
      throw evidenceRejected('SUBMITTED_NOT_CONFIRMED');
    }
    if (availability) {
      if (operator) await this.confirmAvailabilityByOperator(context, plan);
      else await this.confirmAvailability(context, plan, evidences);
      return registrationResult({
        ...base,
        providerOutcome: 'succeeded',
        mallOutcome: 'confirmed',
        externalListingId: null,
        evidence: null,
        channelListingId: null,
      });
    }
    if (!DOCUMENT_KINDS.has(plan.executionKind)) {
      return registrationResult({
        ...base,
        providerOutcome: 'succeeded',
        mallOutcome: 'confirmed',
        externalListingId: plan.externalListingId,
        evidence: chunkEvidence,
        channelListingId: plan.channelListingId,
      });
    }
    const payload = RegistrationDocumentPayloadSchema.parse(plan.payload);
    if (!payload.snapshot) throw new KiditemConflictError('STATE_CONFLICT', { details: { reason: 'TARGET_SNAPSHOT_MISSING' } });
    const evidence = confirmationEvidence(plan, chunkEvidence, operator);
    const confirmed = await this.repository.confirmTarget(context.tx, {
      organizationId: context.organizationId,
      channelAccountId: plan.channelAccountId,
      expectedProviderAccountId: plan.expectedProviderAccountId,
      snapshot: payload.snapshot,
      evidence,
      confirmedByOperator: operator !== null,
    });
    return registrationResult({
      ...base,
      providerOutcome: 'succeeded',
      mallOutcome: 'confirmed',
      externalListingId: evidence.externalListingId,
      evidence: chunkEvidence ?? toEvidence(evidence, plan.payloadHash),
      channelListingId: confirmed.channelListingId,
    });
  }

  /**
   * 품절 · 재개 묶음의 확인(리더 결정, KID-364): 리스팅마다 증거 하나가 있어야 하고 판매자 식별자는 문서 실행과 같이 대조한다.
   * 옵션 단위 몰은 얼린 옵션마다 다시 읽은 값이 지시와 맞아야 하고, 리스팅 단위 몰은 다시 읽은 리스팅 상태가 있어야 하며 그 상태를
   * 리스팅에 적는다(몰이 보고한 사실).
   */
  /**
   * 운영자가 몰에서 본 것으로 `reconciling` 품절 · 재개를 닫는다(온채널 승인 대기처럼 확장이 재읽기 증거를 낼 수 없던 실행).
   * 운영자 확인이 곧 증거다 — 리스팅 단위 몰은 지시대로 리스팅 상태를 적는다(옵션 단위 몰은 옵션 상태를 적는 칸이 없어 실행 성공이 사실).
   */
  private async confirmAvailabilityByOperator(context: RegistrationFinalizeContext, plan: RegistrationPlan): Promise<void> {
    const action = plan.executionKind as 'sold_out' | 'resume';
    if (getListingAvailabilityCapability(plan.mallKey, action)?.axis === 'option') return;
    const payload = parseRegistrationPayload(action, plan.payload);
    await this.repository.recordListingStatuses(context.tx, {
      organizationId: context.organizationId,
      channelAccountId: plan.channelAccountId,
      listings: payload.listings.map((listing) => ({
        channelListingId: listing.channelListingId,
        externalListingId: listing.externalListingId,
        status: action === 'sold_out' ? OPERATOR_SOLD_OUT_STATUS : OPERATOR_RESUMED_STATUS,
      })),
    });
  }

  private async confirmAvailability(context: RegistrationFinalizeContext, plan: RegistrationPlan, evidences: RegistrationEvidence[]): Promise<void> {
    const action = plan.executionKind as 'sold_out' | 'resume';
    const payload = parseRegistrationPayload(action, plan.payload);
    const byOption = getListingAvailabilityCapability(plan.mallKey, action)?.axis === 'option';
    const adapter = this.adapters.get(plan.mallKey);
    const statuses: Array<{ channelListingId: string; externalListingId: string; status: string }> = [];
    for (const listing of payload.listings) {
      const evidence = evidences.find((item) => item.externalListingId === listing.externalListingId);
      if (!evidence) throw evidenceRejected('AVAILABILITY_EVIDENCE_MISSING');
      const decision = adapter.validateConfirmationEvidence(plan.expectedProviderAccountId, {
        providerAccountId: evidence.providerAccountId,
        observedUrl: evidence.observedUrl,
        // 몰 상품 id 는 얼린 리스팅과 같은지로 이미 맞췄다(옛 가용성 보고와 같다) — 형식은 다시 보지 않는다.
        externalListingId: null,
      });
      if (!decision.ok) throw evidenceRejected(decision.reason);
      if (byOption) {
        const observed = new Map((evidence.observedOptions ?? []).map((option) => [option.externalOptionId, option]));
        if (listing.options.some((option) => {
          const reread = observed.get(option.externalOptionId);
          return !reread || !observedOptionConfirms(action, reread);
        })) throw evidenceRejected('OPTION_REREAD_MISMATCH');
      } else {
        if (!evidence.observedStatus) throw evidenceRejected('AVAILABILITY_STATUS_UNREAD');
        statuses.push({ channelListingId: listing.channelListingId, externalListingId: listing.externalListingId, status: evidence.observedStatus });
      }
    }
    if (statuses.length > 0) {
      await this.repository.recordListingStatuses(context.tx, { organizationId: context.organizationId, channelAccountId: plan.channelAccountId, listings: statuses });
    }
  }

  /**
   * `reconciling` 등록 실행을 운영자가 몰에서 읽은 등록상품ID로 확인한다(KID-218). 같은 조직의 운영자면 누구나 닫을 수 있다
   * (리더 가정 = KID-329 (a), 사장님 확인 대기).
   */
  async confirm(organizationId: string, operationId: string, request: RegistrationConfirmRequest): Promise<OperationView> {
    await this.requireRegistration(organizationId, operationId);
    const response = await this.operations.resolve({
      organizationId,
      operationId,
      outcome: 'succeeded',
      result: {
        externalListingId: request.externalListingId,
        operatorConfirmation: {
          externalListingId: request.externalListingId,
          observedUrl: request.observedUrl ?? null,
          options: (request.options ?? []).map((option) => ({ ...option, sellerSku: option.sellerSku ?? null })),
        },
      },
    });
    return response.operation;
  }

  /** 운영자가 몰에서 등록되지 않은 것을 확인했다 — 실패로 닫는다(재시도 없음). 같은 조직 운영자 누구나(KID-329 (a) 가정). */
  async close(organizationId: string, operationId: string, request: RegistrationCloseRequest): Promise<OperationView> {
    await this.requireRegistration(organizationId, operationId);
    const response = await this.operations.resolve({
      organizationId,
      operationId,
      outcome: 'failed',
      errorCode: REGISTRATION_NOT_FOUND_ON_MALL_CODE,
      errorMessage: request.reason,
      result: { providerOutcome: 'definitive_failure', closedReason: request.reason },
    });
    return response.operation;
  }

  private async requireRegistration(organizationId: string, operationId: string): Promise<void> {
    const operation = await this.operations.get(organizationId, operationId);
    if (!operation || operation.kind !== REGISTRATION_KIND) throw new KiditemNotFoundError('OPERATION_NOT_FOUND');
  }
}

function readFill(chunks: OperationStagedChunk[]): RegistrationFill {
  const fills = chunks.filter((chunk) => chunk.chunkKind === REGISTRATION_FILL_CHUNK_KIND).flatMap((chunk) => chunk.payload);
  if (fills.length === 0) return EMPTY_FILL;
  return fills.map((item) => RegistrationFillSchema.parse(item)).reduce((all, item) => ({
    steps: [...all.steps, ...item.steps],
    warnings: [...all.warnings, ...item.warnings],
    manualSteps: [...all.manualSteps, ...item.manualSteps],
    dialogs: [...all.dialogs, ...item.dialogs],
  }), EMPTY_FILL);
}

/**
 * 확장이 보낸 증거. 문서 실행은 0~1개, 품절 · 재개 묶음은 리스팅마다 하나. 모양이 틀리거나 같은 리스팅이 두 번이면 증거 거절,
 * 얼린 문서와 다른 해시의 증거는 이 실행의 것이 아니다.
 */
function readEvidences(chunks: OperationStagedChunk[], plan: RegistrationPlan): RegistrationEvidence[] {
  const items = chunks.filter((chunk) => chunk.chunkKind === REGISTRATION_EVIDENCE_CHUNK_KIND).flatMap((chunk) => chunk.payload);
  const batch = plan.executionKind === 'sold_out' || plan.executionKind === 'resume';
  if (!batch && items.length > 1) throw evidenceRejected('EVIDENCE_REPEATED');
  const evidences = items.map((item) => {
    const parsed = RegistrationEvidenceSchema.safeParse(item);
    if (!parsed.success) throw evidenceRejected('EVIDENCE_INVALID');
    return parsed.data;
  });
  const listings = evidences.map((evidence) => evidence.externalListingId);
  if (new Set(listings).size !== listings.length) throw evidenceRejected('EVIDENCE_REPEATED');
  for (const evidence of evidences) {
    if (evidence.payloadHash !== plan.payloadHash) {
      throw new KiditemConflictError('CHANNELS_EXECUTION_FENCE_LOST', { details: { reason: 'PAYLOAD_HASH_MISMATCH' } });
    }
    if (evidence.channelAccountId !== plan.channelAccountId) throw evidenceRejected('EVIDENCE_ACCOUNT_MISMATCH');
  }
  return evidences;
}

function evidenceRejected(reason: string): KiditemConflictError {
  return new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason } });
}

type OperatorConfirmation = {
  externalListingId: string;
  observedUrl: string | null;
  options: Array<{ salesProductOptionId: string; externalOptionId: string; sellerSku: string | null }>;
};

function readOperatorConfirmation(result: Record<string, unknown>): OperatorConfirmation | null {
  const value = result.operatorConfirmation;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as OperatorConfirmation;
}

/** 확인 증거: 운영자가 읽은 등록상품ID · 옵션이 확장 증거보다 이긴다. 몰 상품 id 가 없으면 확인이 아니다. */
function confirmationEvidence(
  plan: RegistrationPlan,
  chunk: RegistrationEvidence | null,
  operator: OperatorConfirmation | null,
): RegistrationConfirmationEvidence {
  const externalListingId = operator?.externalListingId ?? chunk?.externalListingId ?? null;
  if (!externalListingId) {
    throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'PROVIDER_LISTING_MISSING' } });
  }
  if (chunk?.externalListingId && chunk.externalListingId !== externalListingId) {
    throw new KiditemConflictError('CHANNELS_EXECUTION_EVIDENCE_REJECTED', { details: { reason: 'PROVIDER_LISTING_CHANGED' } });
  }
  return {
    channelAccountId: chunk?.channelAccountId ?? plan.channelAccountId,
    externalListingId,
    observedUrl: operator?.observedUrl ?? chunk?.observedUrl ?? null,
    providerAccountId: chunk?.providerAccountId ?? null,
    observedStatus: chunk?.observedStatus ?? null,
    options: operator && operator.options.length > 0
      ? operator.options
      : (chunk?.options ?? []).map((option) => ({ ...option, sellerSku: option.sellerSku ?? null })),
  };
}

function toEvidence(evidence: RegistrationConfirmationEvidence, payloadHash: string): RegistrationEvidence {
  return {
    payloadHash,
    channelAccountId: evidence.channelAccountId,
    externalListingId: evidence.externalListingId,
    observedUrl: evidence.observedUrl,
    providerAccountId: evidence.providerAccountId,
    observedStatus: evidence.observedStatus,
    message: null,
    options: evidence.options,
  };
}

function registrationResult(input: {
  providerOutcome: RegistrationResult['providerOutcome'];
  mallOutcome: RegistrationMallOutcome;
  submitted: boolean;
  submitSkipped: string | null;
  externalListingId: string | null;
  mallMessage: string | null;
  fill: RegistrationFill;
  evidence: RegistrationEvidence | null;
  channelListingId: string | null;
}): Record<string, unknown> {
  return RegistrationResultSchema.parse(input);
}
