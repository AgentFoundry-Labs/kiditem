import { targetRegistrationExecutionApi } from '@/app/(channels)/_shared/registration-execution-api';
import { registrationTargetApi } from '@/lib/registration-target-api';
import { sendMallPrice, MallPriceSendError, MALL_PRICE_SEND_NOTE, type MallPriceSendResult } from './mall-price-send';
import type {
  RegistrationTarget,
  ReportTargetExecutionInput,
  SalesProduct,
  TargetExecutionResult,
} from '@kiditem/shared/sales-product';

export type TargetPriceSelectionReason =
  | 'ready'
  | 'no-target'
  | 'listing-option-unlinked'
  | 'target-option-unselected';

export interface TargetPriceSelection {
  target: RegistrationTarget;
  listingOption: SalesProduct['channelListings'][number]['options'][number];
  targetOption: RegistrationTarget['resolved']['options'][number];
  salesProductOptionId: string;
}

export interface TargetPriceResolution {
  candidates: RegistrationTarget[];
  reason: TargetPriceSelectionReason;
  selection: TargetPriceSelection | null;
}

export interface FrozenMallPriceRequest {
  code: string;
  price: number;
  ifPrice: number | null;
  externalListingId: string;
  salesProductOptionId: string;
}

export interface MallPriceReportDecision {
  outcome: ReportTargetExecutionInput['outcome'];
  confirmed: boolean;
  after: number | null;
  observedUrl: string | null;
  message: string;
  evidence: ReportTargetExecutionInput['evidence'];
}

const ACTIVE_EXECUTION_STATUSES = new Set<TargetExecutionResult['status']>([
  'prepared',
  'executing',
  'reconciling',
]);

/**
 * Resolve a price-update target only through the listing's exact channel account and option link.
 *
 * 상품 × 몰 계정당 등록 설정은 하나뿐이다(부분 유일키, 사용자 결정 01:12) — 고를 것이 없다.
 */
export function resolveTargetPrice(
  listing: SalesProduct['channelListings'][number],
  targets: readonly RegistrationTarget[],
): TargetPriceResolution {
  const candidates = targets.filter((target) => target.channelAccountId === listing.channelAccountId);
  if (candidates.length === 0) {
    return { candidates: [], reason: 'no-target', selection: null };
  }

  const listingOption = listing.options.length === 1 ? listing.options[0] : undefined;
  const salesProductOptionId = listingOption?.salesProductOptionId ?? null;
  if (!listingOption || !salesProductOptionId) {
    return { candidates: [...candidates], reason: 'listing-option-unlinked', selection: null };
  }

  const target = candidates[0];
  if (!target) {
    return { candidates: [...candidates], reason: 'no-target', selection: null };
  }

  const targetOption = target.resolved.options.find((option) => option.salesProductOptionId === salesProductOptionId);
  if (!targetOption) {
    return { candidates: [...candidates], reason: 'target-option-unselected', selection: null };
  }

  return {
    candidates: [...candidates],
    reason: 'ready',
    selection: { target, listingOption, targetOption, salesProductOptionId },
  };
}

/** Find only an active sale-price update for this exact listing; other target executions cannot be resumed here. */
export function latestActiveMallPriceExecution(
  history: readonly TargetExecutionResult[],
  listingId: string,
): TargetExecutionResult | undefined {
  return [...history]
    .filter((execution) => (
      ACTIVE_EXECUTION_STATUSES.has(execution.status)
      && execution.payload.kind === 'update'
      && execution.payload.channelListingId === listingId
      && execution.payload.updateFields?.includes('salePrice')
    ))
    .sort((left, right) => executionTimestamp(right.createdAt) - executionTimestamp(left.createdAt))[0];
}

export function canResumeMallPriceExecution(execution: TargetExecutionResult | undefined): boolean {
  return execution?.status === 'prepared' && execution.providerOutcome === 'not_attempted';
}

/** Build the provider request from the immutable execution payload after the server grants the lease. */
export function frozenMallPriceRequest(
  execution: TargetExecutionResult,
  listingId: string,
): FrozenMallPriceRequest {
  const payloadListingId = execution.payload.channelListingId;
  if (!payloadListingId || payloadListingId !== listingId) {
    throw new Error('동결된 실행 상품과 현재 몰 상품이 다릅니다. 다시 불러오세요.');
  }
  const listing = execution.payload.product.channelListings.find((candidate) => candidate.id === listingId);
  if (!listing || listing.id !== payloadListingId || listing.options.length !== 1) {
    throw new Error('동결된 실행에는 단일 옵션 몰 상품이 없습니다.');
  }
  const listingOption = listing.options[0];
  const salesProductOptionId = listingOption?.salesProductOptionId;
  if (!listingOption || !salesProductOptionId) {
    throw new Error('동결된 실행의 몰 옵션 연결을 확인할 수 없습니다.');
  }
  const productOption = execution.payload.product.options.find((option) => option.id === salesProductOptionId);
  if (!productOption) {
    throw new Error('동결된 실행의 판매상품 옵션을 확인할 수 없습니다.');
  }
  // 몰 가격 보내기는 이미 등록된(= 가격이 있는) 상품만 다룬다 — 초안(가격 null)은 여기 닿지 않는다.
  if (productOption.salePrice == null) {
    throw new Error('동결된 실행의 판매가가 비어 있습니다.');
  }
  return {
    code: listing.externalId,
    price: productOption.salePrice,
    ifPrice: listingOption.salePrice,
    externalListingId: listing.externalId,
    salesProductOptionId,
  };
}

/** Accept only a URL observed by the extension; the server still enforces the provider origin. */
export function realObservedUrl(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function mallPriceReportDecision(
  mallKey: string,
  execution: TargetExecutionResult,
  frozen: FrozenMallPriceRequest,
  transport: MallPriceSendResult,
  approvalNote?: string,
): MallPriceReportDecision {
  if (transport.submissionAttempted === false && transport.sent === 0) {
    return notSubmittedMallPriceReport(execution, transport.warnings.join(' ') || '몰에 가격 변경을 제출하지 않았습니다.');
  }
  const answer = transport.results.find((result) => result.code === frozen.code);
  const observedUrl = realObservedUrl(answer?.observedUrl);
  const after = answer?.after ?? null;
  const exactProviderObservation = Boolean(
    answer
    && answer.code === frozen.code
    && answer.confirmed === true
    && answer.after === frozen.price
    && observedUrl,
  );
  const accepted = transport.sent > 0;
  const providerAccountMustBeConfirmed = Boolean(execution.expectedProviderAccountId);

  let outcome: MallPriceReportDecision['outcome'];
  if (mallKey === 'kidsnote') {
    outcome = accepted ? 'awaiting_approval' : 'uncertain';
  } else if (exactProviderObservation && !providerAccountMustBeConfirmed) {
    outcome = 'confirmed';
  } else if (accepted) {
    outcome = 'submitted';
  } else {
    outcome = 'uncertain';
  }

  const note = mallKey === 'kidsnote' && approvalNote
    ? approvalNote
    : providerAccountMustBeConfirmed && exactProviderObservation
      ? '몰 가격은 반영된 것으로 보이지만 선택된 계정의 실제 provider 계정 식별자를 확인할 수 없어 수동 확인이 필요합니다.'
      : transport.warnings[0]
        ?? (outcome === 'confirmed'
          ? '몰 가격을 확인했습니다.'
          : '몰에 가격을 보냈지만 확인 결과가 없어 재전송하지 않고 결과 확인을 기다립니다.');

  const evidence: ReportTargetExecutionInput['evidence'] = {
    channelAccountId: execution.channelAccountId,
    externalListingId: frozen.externalListingId,
    ...(observedUrl ? { observedUrl } : {}),
    message: note,
  };

  return {
    outcome,
    confirmed: outcome === 'confirmed',
    after,
    observedUrl,
    message: note,
    evidence,
  };
}

export function uncertainMallPriceReport(
  execution: TargetExecutionResult,
  frozen: FrozenMallPriceRequest | null,
  message: string,
): MallPriceReportDecision {
  return {
    outcome: 'uncertain',
    confirmed: false,
    after: null,
    observedUrl: null,
    message,
    evidence: {
      channelAccountId: execution.channelAccountId,
      ...(frozen ? { externalListingId: frozen.externalListingId } : {}),
      message,
    },
  };
}

export function notSubmittedMallPriceReport(
  execution: TargetExecutionResult,
  message: string,
): MallPriceReportDecision {
  return {
    outcome: 'not_submitted',
    confirmed: false,
    after: null,
    observedUrl: null,
    message,
    evidence: {
      channelAccountId: execution.channelAccountId,
      message,
    },
  };
}

function executionTimestamp(value: string | Date | undefined): number {
  if (!value) return 0;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The provider is called only after one successful server claim, using its frozen values. */
export async function executeTargetMallPrice(
  input: {
    salesProductId: string;
    channelAccountId: string;
    expectedPrice: number;
    listingId: string;
    mallKey: string;
    idempotencyKey: string;
  },
  client = targetRegistrationExecutionApi,
  send = sendMallPrice,
  resolveTarget = registrationTargetApi.resolve,
): Promise<{ execution: TargetExecutionResult; decision: MallPriceReportDecision | null; sent: boolean }> {
  const target = await resolveTarget({
    salesProductId: input.salesProductId,
    channelAccountId: input.channelAccountId,
  });
  if (target.channelAccountId !== input.channelAccountId || target.salesProductId !== input.salesProductId) {
    throw new Error('몰별 등록 설정의 상품과 계정을 확인할 수 없습니다.');
  }
  const history = await client.list(target.id);
  const active = latestActiveMallPriceExecution(history, input.listingId);
  if (active && !canResumeMallPriceExecution(active)) {
    return { execution: active, decision: null, sent: false };
  }
  const prepared = active ?? await client.prepare(target.id, {
    expectedVersion: target.version, kind: 'update', updateFields: ['salePrice'],
    channelListingId: input.listingId, idempotencyKey: input.idempotencyKey, applyCompositionTemplate: false,
  });
  if (prepared.channelAccountId !== target.channelAccountId || prepared.targetId !== target.id) {
    throw new Error('선택한 등록 대상과 실행의 계정이 다릅니다.');
  }
  const started = await client.start(prepared.executionId);
  if (!started.maySubmit) return { execution: started, decision: null, sent: false };
  if (!started.leaseToken) throw new Error('가격 전송 실행 권한을 확인하지 못했습니다.');
  let decision: MallPriceReportDecision;
  let dispatched = false;
  let frozen: FrozenMallPriceRequest | null = null;
  try {
    frozen = frozenMallPriceRequest(started, input.listingId);
    if (frozen.price !== input.expectedPrice) {
      throw new MallPriceSendError('가격이 바뀌었습니다. 몰에서 보일 가격을 다시 확인한 뒤 보내세요.');
    }
    const listing = started.payload.product.channelListings.find(row => row.id === input.listingId)!;
    if (listing.channelAccountId !== started.channelAccountId || listing.mallKey !== input.mallKey) {
      throw new MallPriceSendError('동결된 몰 계정이 선택한 계정과 다릅니다.');
    }
    dispatched = true;
    const transport = await send(input.mallKey, [frozen], {
      executionId: started.executionId, payloadHash: started.payloadHash, leaseToken: started.leaseToken,
    });
    decision = mallPriceReportDecision(input.mallKey, started, frozen, transport, MALL_PRICE_SEND_NOTE[input.mallKey]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    decision = error instanceof MallPriceSendError && !error.dispatchAttempted
      ? notSubmittedMallPriceReport(started, message)
      : !dispatched
        ? notSubmittedMallPriceReport(started, message)
        : uncertainMallPriceReport(started, frozen, message);
  }
  const execution = await client.report(started.executionId, {
    leaseToken: started.leaseToken, payloadHash: started.payloadHash,
    outcome: decision.outcome, evidence: decision.evidence,
  });
  return { execution, decision, sent: dispatched };
}
