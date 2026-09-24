import {
  listingAvailabilityExecutionApi,
  type ListingAvailabilityExecutionContext,
} from './listing-availability-execution-api';
import type {
  ListingAvailabilityExecution,
  ListingAvailabilitySnapshot,
  PrepareListingAvailabilityInput,
  ReportListingAvailabilityInput,
} from '@kiditem/shared/sales-product';
import type { MallAvailabilitySendResult } from './mall-availability-send';

type ListingAvailabilityExecutionClient = Pick<
  typeof listingAvailabilityExecutionApi,
  'prepare' | 'list' | 'start' | 'report'
>;

export interface ExecuteListingAvailabilityInput {
  channelAccountId: string;
  externalListingId: string;
  mallKey: string;
  kind: PrepareListingAvailabilityInput['kind'];
  optionCodes?: readonly string[];
  idempotencyKey?: string;
  client?: ListingAvailabilityExecutionClient;
  send: (
    snapshot: ListingAvailabilitySnapshot,
    context: ListingAvailabilityExecutionContext,
  ) => Promise<MallAvailabilitySendResult>;
}

export interface ListingAvailabilityExecutionRun {
  execution: ListingAvailabilityExecution;
  transportResult: MallAvailabilitySendResult | null;
  adapterCalled: boolean;
  activeReused: boolean;
  transportError: string | null;
}

function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  return cryptoApi?.randomUUID?.() ?? `listing-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isActive(execution: ListingAvailabilityExecution): boolean {
  return execution.status === 'prepared'
    || execution.status === 'executing'
    || execution.status === 'reconciling';
}

function isFreshPrepared(execution: ListingAvailabilityExecution): boolean {
  return execution.status === 'prepared' && execution.providerOutcome === 'not_attempted';
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reportInput(
  execution: ListingAvailabilityExecution,
  outcome: ReportListingAvailabilityInput['outcome'],
  message: string,
): ReportListingAvailabilityInput | null {
  if (!execution.leaseToken) return null;
  return {
    leaseToken: execution.leaseToken,
    payloadHash: execution.payloadHash,
    outcome,
    evidence: {
      channelAccountId: execution.channelAccountId,
      externalListingId: execution.payload.externalListingId,
      message,
    },
  };
}

function wingConfirmation(execution: ListingAvailabilityExecution, result: MallAvailabilitySendResult | null) {
  if (execution.payload.mallKey !== 'coupang' || !execution.expectedProviderAccountId
    || !result || result.failed > 0 || result.requestOnly) return null;
  const evidence = result.wingEvidence?.filter((entry) => entry.externalListingId === execution.payload.externalListingId) ?? [];
  if (evidence.length !== 1 || evidence[0].providerAccountId !== execution.expectedProviderAccountId) return null;
  const observed = evidence[0].observedOptionStocks;
  const wanted = execution.payload.optionCodes;
  const ids = new Set(observed.map((option) => option.externalOptionId));
  if (wanted.length === 0 || observed.length !== wanted.length || ids.size !== observed.length
    || wanted.some((id) => !ids.has(id)) || observed.some((option) => option.registrationType !== 'NORMAL'
      || !Number.isSafeInteger(option.stock) || option.stock < 0
      || (execution.payload.kind === 'sold_out' ? option.stock !== 0 : option.stock === 0))) return null;
  return evidence[0];
}

async function recordTransportAttempt(
  client: ListingAvailabilityExecutionClient,
  execution: ListingAvailabilityExecution,
  result: MallAvailabilitySendResult | null,
  transportError: string | null,
): Promise<ListingAvailabilityExecution> {
  const confirmation = transportError ? null : wingConfirmation(execution, result);
  const outcome: ReportListingAvailabilityInput['outcome'] = confirmation ? 'confirmed' : transportError
    ? 'uncertain'
    : result?.requestOnly
      ? 'awaiting_approval'
      : (result?.sent ?? 0) > 0
        ? 'submitted'
        : 'uncertain';
  const message = confirmation ? '지정된 몰 계정에서 모든 대상 옵션의 재고를 다시 읽어 확인했습니다.' : transportError
    ? `브라우저 전송 결과를 확인할 수 없습니다: ${transportError}`
    : result?.requestOnly
      ? `관리자 승인 요청 전송 건수 ${result.sent}, 실패 ${result.failed}`
      : `전송 건수 ${result?.sent ?? 0}, 실패 ${result?.failed ?? 0}; 몰 계정과 실제 상태를 확인해야 합니다.`;
  const input = reportInput(execution, outcome, message);
  if (!input) return execution;
  if (confirmation) {
    input.evidence.providerAccountId = confirmation.providerAccountId;
    input.evidence.observedOptionStocks = confirmation.observedOptionStocks;
  }
  try {
    return await client.report(execution.executionId, input);
  } catch {
    // Provider I/O may already have happened. The executing row blocks a resend
    // while the operator or a later history read reconciles the attempt.
    return execution;
  }
}

/**
 * A listing action always reads history before creating an intent. Existing
 * executing/reconciling rows are returned for display and never sent again.
 */
export async function executeListingAvailability(
  input: ExecuteListingAvailabilityInput,
): Promise<ListingAvailabilityExecutionRun> {
  const client = input.client ?? listingAvailabilityExecutionApi;
  const histories = await client.list(input.channelAccountId, input.externalListingId);
  let execution = histories.find(isActive);
  let activeReused = Boolean(execution);

  if (!execution) {
    execution = await client.prepare({
      channelAccountId: input.channelAccountId,
      externalListingId: input.externalListingId,
      kind: input.kind,
      optionCodes: [...new Set((input.optionCodes ?? []).map((code) => code.trim()).filter(Boolean))],
      idempotencyKey: input.idempotencyKey ?? newIdempotencyKey(),
    });
    activeReused = false;
  }

  if (!isActive(execution) || (execution.status !== 'prepared' && execution.status !== 'executing')) {
    return { execution, transportResult: null, adapterCalled: false, activeReused, transportError: null };
  }
  if (execution.status !== 'prepared' || !isFreshPrepared(execution)) {
    return { execution, transportResult: null, adapterCalled: false, activeReused, transportError: null };
  }

  const started = await client.start(execution.executionId);
  execution = started;
  if (!started.maySubmit || started.status !== 'executing' || !started.leaseToken) {
    return { execution, transportResult: null, adapterCalled: false, activeReused, transportError: null };
  }

  const context: ListingAvailabilityExecutionContext = {
    executionId: started.executionId,
    payloadHash: started.payloadHash,
    leaseToken: started.leaseToken,
    ...(started.expectedProviderAccountId ? { expectedProviderAccountId: started.expectedProviderAccountId } : {}),
  };
  let transportResult: MallAvailabilitySendResult | null = null;
  let transportError: string | null = null;
  try {
    transportResult = await input.send(started.payload, context);
  } catch (error) {
    transportError = toMessage(error);
  }
  execution = await recordTransportAttempt(client, started, transportResult, transportError);
  return { execution, transportResult, adapterCalled: true, activeReused, transportError };
}
