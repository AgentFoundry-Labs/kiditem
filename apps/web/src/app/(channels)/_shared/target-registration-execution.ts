import {
  defaultAdapterValues,
  itemSourceProblem,
  type MallPublishAdapter,
  type MallPublishItem,
  type MallSendOutcome,
} from './mall-publish-adapter';
import { targetRegistrationExecutionApi } from './registration-execution-api';
import type {
  PrepareTargetExecutionInput,
  TargetExecutionResult,
  TargetExecutionSnapshot,
} from '@kiditem/shared/sales-product';

type TargetExecutionClient = Pick<
  typeof targetRegistrationExecutionApi,
  'prepare' | 'start' | 'report'
>;

export interface ExecuteTargetRegistrationInput {
  targetId: string;
  expectedVersion: number;
  channelAccountId: string;
  mallKey: string;
  adapter: MallPublishAdapter;
  kind?: PrepareTargetExecutionInput['kind'];
  applyCompositionTemplate?: boolean;
  /** Only explicit edits in the existing registration wizard. */
  adapterValues?: Record<string, string>;
  idempotencyKey?: string;
  /**
   * A recent history row owned by this operator. Active rows are resumed from
   * their frozen payload; executing/reconciling rows are displayed and never
   * sent again.
   */
  existingExecution?: TargetExecutionResult;
  client?: TargetExecutionClient;
}

export interface TargetRegistrationExecutionRun {
  execution: TargetExecutionResult;
  outcome: MallSendOutcome;
  /** True only when the adapter was called after a fresh server lease. */
  adapterCalled: boolean;
}

export function isActiveTargetExecution(
  execution: Pick<TargetExecutionResult, 'status' | 'providerOutcome'>,
): boolean {
  return execution.status === 'prepared'
    || execution.status === 'executing'
    || execution.status === 'reconciling';
}

function isFreshPreparedTargetExecution(
  execution: Pick<TargetExecutionResult, 'status' | 'providerOutcome'>,
): boolean {
  return execution.status === 'prepared' && execution.providerOutcome === 'not_attempted';
}

function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  return cryptoApi?.randomUUID?.() ?? `target-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function directRegistrationValues(input: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      values[key] = String(value);
    }
  }
  return values;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** 어댑터 namespace 값: 글자 · 숫자 · 참거짓은 글자로, 안에 든 객체 · 배열은 그 키 아래 JSON 글자로 둔다. */
function adapterNamespaceValues(input: Record<string, unknown>): Record<string, string> {
  const values = directRegistrationValues(input);
  for (const [key, value] of Object.entries(input)) {
    if (value !== null && typeof value === 'object') values[key] = JSON.stringify(value);
  }
  return values;
}

/**
 * 등록 대상이 몰에 넘기는 값(KID-313): 몰 카테고리 · 몰 전용 칸(`mallFields`) · 이 채널의 어댑터 namespace
 * (`adapter[mallKey]`). `registrationInput` 에서 다른 것은 읽지 않는다 — 상품 사실은 동결된 판매상품에서 온다.
 */
function targetRegistrationValues(
  input: TargetExecutionSnapshot['registrationInput'],
  mallKey: string,
): Record<string, string> {
  const category = recordValue(input.mallCategory);
  return {
    ...(typeof category.key === 'string'
      ? { mallCategoryKey: category.key, mallCategoryLabel: typeof category.label === 'string' ? category.label : '' }
      : {}),
    ...directRegistrationValues(recordValue(input.mallFields)),
    ...adapterNamespaceValues(recordValue(recordValue(input.adapter)[mallKey])),
  };
}

/**
 * Adapter fields remain the provider boundary. Values are read exclusively
 * from the frozen target document and product override snapshot; this function
 * never reaches back to the editable sales-product screen.
 */
export function valuesForTargetExecution(
  snapshot: TargetExecutionSnapshot,
  mallKey: string,
  _adapter: MallPublishAdapter,
): Record<string, string> {
  const override = snapshot.product.channelOverrides.find((item) => item.mallKey === mallKey);
  return {
    ...(snapshot.adapterDefaults ?? {}),
    ...(override?.adapterValues ?? {}),
    ...targetRegistrationValues(snapshot.registrationInput, mallKey),
    ...(snapshot.adapterValues ?? {}),
  };
}

export function itemForTargetExecution(
  snapshot: TargetExecutionSnapshot,
  execution: Pick<TargetExecutionResult, 'executionId' | 'payloadHash' | 'leaseToken'>,
): MallPublishItem {
  const firstOption = snapshot.product.options[0];
  if (!execution.leaseToken) throw new Error('등록 실행 lease가 없습니다. 외부 송신을 시작하지 않았습니다.');
  return {
    candidateId: snapshot.product.id,
    name: snapshot.product.name,
    salePrice: firstOption?.salePrice ?? null,
    thumbnailUrl: snapshot.product.imageUrls[0] ?? null,
    source: 'sales_product',
    optionCount: snapshot.product.options.length,
    targetExecution: {
      executionId: execution.executionId,
      payloadHash: execution.payloadHash,
      leaseToken: execution.leaseToken,
      snapshot,
    },
  };
}

function existingExecutionOutcome(execution: TargetExecutionResult): MallSendOutcome {
  const hasProviderIdentity = Boolean(execution.externalListingId);
  const submitted = execution.providerOutcome === 'succeeded'
    || execution.status === 'succeeded'
    || hasProviderIdentity;
  const statusMessage = execution.status === 'reconciling'
    ? '기존 등록 실행이 재조정 대기 중입니다. 몰에서 결과를 확인하세요.'
    : execution.status === 'executing'
      ? '기존 등록 실행이 진행 중입니다. 중복 송신하지 않았습니다.'
      : execution.status === 'succeeded'
        ? '기존 등록 실행이 성공으로 기록되어 있습니다.'
        : `기존 등록 실행 상태: ${execution.status}`;
  return {
    ok: execution.status === 'succeeded' || execution.providerOutcome === 'succeeded',
    confirmed: false,
    ...(submitted ? {
      submitted: true,
      accepted: execution.providerOutcome === 'succeeded' ? true : null,
      productNo: execution.externalListingId,
    } : {}),
    manualSteps: execution.status === 'reconciling' ? [statusMessage] : [],
    warnings: [statusMessage, '서버가 허용한 새 lease가 없어 외부 송신을 건너뛰었습니다.'],
    ...(execution.status === 'failed' ? { error: statusMessage } : {}),
  };
}

function notSubmittedOutcome(message: string): MallSendOutcome {
  return {
    ok: false,
    confirmed: false,
    submitted: false,
    manualSteps: [],
    warnings: [],
    error: message,
  };
}

function uncertainOutcome(message: string): MallSendOutcome {
  return {
    ok: false,
    confirmed: false,
    submitted: false,
    manualSteps: [],
    warnings: ['제출 여부를 확인할 수 없어 재송신하지 않습니다.'],
    error: message,
  };
}

function reportOutcome(
  adapter: MallPublishAdapter,
  sent: MallSendOutcome,
): {
  outcome: 'not_submitted' | 'uncertain' | 'submitted' | 'awaiting_approval';
  evidence: {
    externalListingId?: string;
    observedStatus: string;
    message?: string;
  };
} {
  if (sent.submitted === false) {
    return {
      outcome: 'not_submitted',
      evidence: {
        observedStatus: 'not_submitted',
        ...(sent.error ? { message: sent.error } : {}),
      },
    };
  }
  if (sent.submitted !== true) {
    return {
      outcome: 'uncertain',
      evidence: { observedStatus: 'uncertain', message: sent.error ?? '몰의 제출 여부를 확인하지 못했습니다.' },
    };
  }
  if (sent.accepted === false) {
    return {
      outcome: 'uncertain',
      evidence: {
        observedStatus: 'submission_rejected',
        ...(sent.productNo ? { externalListingId: sent.productNo } : {}),
        ...(sent.error ? { message: sent.error } : {}),
      },
    };
  }
  const outcome = adapter.requiresOperatorSubmit || (sent.manualSteps.length > 0)
    ? 'awaiting_approval'
    : 'submitted';
  return {
    outcome,
    evidence: {
      observedStatus: outcome,
      ...(sent.productNo ? { externalListingId: sent.productNo } : {}),
      ...(sent.error ? { message: sent.error } : {}),
    },
  };
}

/**
 * Execute one saved registration target through the existing mall adapter.
 *
 * The provider adapter is reachable only after the server returns `maySubmit`.
 * A replay, an existing lease, or an uncertain execution is displayed to the
 * caller and never sent again. The server result remains the authoritative state.
 */
export async function executeTargetRegistration(
  input: ExecuteTargetRegistrationInput,
): Promise<TargetRegistrationExecutionRun> {
  const client = input.client ?? targetRegistrationExecutionApi;
  if (input.existingExecution && !isFreshPreparedTargetExecution(input.existingExecution)) {
    return {
      execution: input.existingExecution,
      outcome: existingExecutionOutcome(input.existingExecution),
      adapterCalled: false,
    };
  }
  const prepared = input.existingExecution ?? await client.prepare(input.targetId, {
    expectedVersion: input.expectedVersion,
    kind: input.kind ?? 'register',
    idempotencyKey: input.idempotencyKey ?? newIdempotencyKey(),
    applyCompositionTemplate: input.applyCompositionTemplate ?? false,
    adapterDefaults: defaultAdapterValues(input.adapter),
    ...(input.adapterValues ? { adapterValues: input.adapterValues } : {}),
  });
  const started = await client.start(prepared.executionId);
  if (!started.maySubmit) {
    return {
      execution: started,
      outcome: existingExecutionOutcome(started),
      adapterCalled: false,
    };
  }

  if (started.payload.channelAccountId !== input.channelAccountId) {
    throw new Error('등록 실행 채널 계정이 선택한 계정과 다릅니다. 외부 송신을 시작하지 않았습니다.');
  }
  const item = itemForTargetExecution(started.payload, started);
  const values = valuesForTargetExecution(started.payload, input.mallKey, input.adapter);
  const problems = [
    itemSourceProblem(input.adapter, item),
    ...input.adapter.validate(item, values),
  ].filter((problem): problem is string => Boolean(problem));

  if (problems.length > 0) {
    const outcome = notSubmittedOutcome(problems.join(' '));
    const reported = await client.report(started.executionId, {
      leaseToken: started.leaseToken!,
      payloadHash: started.payloadHash,
      outcome: 'not_submitted',
      evidence: {
        channelAccountId: started.payload.channelAccountId,
        observedStatus: 'not_submitted',
        message: outcome.error,
      },
    });
    return { execution: reported, outcome, adapterCalled: false };
  }

  let sent: MallSendOutcome;
  try {
    sent = await input.adapter.send({ items: [item], values });
  } catch (error) {
    const outcome = uncertainOutcome(toMessage(error));
    const reported = await client.report(started.executionId, {
      leaseToken: started.leaseToken!,
      payloadHash: started.payloadHash,
      outcome: 'uncertain',
      evidence: {
        channelAccountId: started.payload.channelAccountId,
        observedStatus: 'uncertain',
        message: outcome.error,
      },
    });
    return { execution: reported, outcome, adapterCalled: true };
  }

  const sentForDisplay: MallSendOutcome = { ...sent, confirmed: false };
  const report = reportOutcome(input.adapter, sentForDisplay);
  const reported = await client.report(started.executionId, {
    leaseToken: started.leaseToken!,
    payloadHash: started.payloadHash,
    outcome: report.outcome,
    evidence: {
      channelAccountId: started.payload.channelAccountId,
      ...report.evidence,
    },
  });
  return { execution: reported, outcome: sentForDisplay, adapterCalled: true };
}
