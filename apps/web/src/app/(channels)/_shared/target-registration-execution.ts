import {
  defaultAdapterValues,
  itemSourceProblem,
  type MallPublishAdapter,
  type MallPublishItem,
  type MallSendChannelAccount,
  type MallSendOutcome,
} from './mall-publish-adapter';
import {
  RegistrationOperationInProgress,
  newRegistrationIdempotencyKey,
  readRegistrationOperation,
  registrationSendOutcome,
  startRegistrationOperation,
  waitForRegistrationOperation,
  type RegistrationOperationRead,
} from './registration-operation';
import { salesProductApi } from '@/lib/sales-product-api';
import type { RegistrationTarget } from '@kiditem/shared/sales-product';

/**
 * 등록 대상 하나를 몰에 보낸다 = 등록 실행(`channels.registration`) 하나(KID-364·256).
 *
 * 웹은 대상의 값으로 어댑터 폼 지시를 만들고 실행을 시작할 뿐이다. 대상·계정·버전 확인과 payload 얼리기는 서버 plan이,
 * 폼 채우기와 [등록] 관문은 확장 몰 쓰기 모듈이 한다(ADR-0014·0019). 같은 대상의 실행이 이미 있으면(잠금) 다시 보내지 않고
 * 그 실행을 보여 준다. 결과는 서버 실행이 권위다 — 폼을 채운 것도 [등록]을 누른 것도 확인이 아니다.
 */

export interface ExecuteTargetRegistrationInput {
  target: Pick<RegistrationTarget, 'id' | 'version' | 'registrationInput' | 'selectedDetailPageRevisionId'>;
  mallKey: string;
  adapter: MallPublishAdapter;
  item: MallPublishItem;
  executionKind?: 'register' | 'update' | 'composition_change';
  /** ADR-0019 관문의 첫 조건. 기본은 [등록]까지 부탁한다(확장 관문이 다시 거른다). */
  submit?: boolean;
  applyCompositionTemplate?: boolean;
  channelListingId?: string;
  optionTransitions?: Array<{ channelListingOptionId: string; salesProductOptionId: string }>;
  /** 이번에 사람이 실제로 고친 값만. 서버가 얼리고 저장된 설정은 바꾸지 않는다. */
  adapterValues?: Record<string, string>;
  /** 확인 창에서 고른 계정(폼이 계정을 알아야 하는 몰). */
  channelAccount?: MallSendChannelAccount;
  idempotencyKey?: string;
}

export interface TargetRegistrationRun {
  /** 시작했거나 이미 돌던 실행. 시작 전에 막혔으면 null. */
  operation: RegistrationOperationRead | null;
  outcome: MallSendOutcome;
  /** 이번 호출이 새 실행을 시작했다(이미 있던 실행을 보여 준 것이 아니다). */
  started: boolean;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function scalarValues(input: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') values[key] = String(value);
  }
  return values;
}

/** 어댑터 namespace 값: 글자 · 숫자 · 참거짓은 글자로, 안에 든 객체 · 배열은 그 키 아래 JSON 글자로 둔다. */
function adapterNamespaceValues(input: Record<string, unknown>): Record<string, string> {
  const values = scalarValues(input);
  for (const [key, value] of Object.entries(input)) {
    if (value !== null && typeof value === 'object') values[key] = JSON.stringify(value);
  }
  return values;
}

/**
 * 몰에 넘기는 값. 어댑터 기본값 < 판매상품의 몰별 값 < 등록 대상의 몰 문서(몰 카테고리 · 몰 전용 칸 · 이 몰의 어댑터
 * namespace, KID-313) < 이번 편집 순으로 이긴다. 대상 문서의 다른 칸은 읽지 않는다 — 상품 사실은 판매상품에서 온다.
 */
export function valuesForTarget(input: {
  registrationInput: Record<string, unknown>;
  mallKey: string;
  adapterDefaults?: Record<string, string>;
  overrideValues?: Record<string, string> | null;
  adapterValues?: Record<string, string>;
}): Record<string, string> {
  const category = recordValue(input.registrationInput.mallCategory);
  return {
    ...(input.adapterDefaults ?? {}),
    ...(input.overrideValues ?? {}),
    ...(typeof category.key === 'string'
      ? { mallCategoryKey: category.key, mallCategoryLabel: typeof category.label === 'string' ? category.label : '' }
      : {}),
    ...scalarValues(recordValue(input.registrationInput.mallFields)),
    ...adapterNamespaceValues(recordValue(recordValue(input.registrationInput.adapter)[input.mallKey])),
    ...(input.adapterValues ?? {}),
  };
}

function notStarted(message: string): TargetRegistrationRun {
  return {
    operation: null,
    started: false,
    outcome: { ok: false, confirmed: false, submitted: false, manualSteps: [], warnings: [], error: message },
  };
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function overrideValues(item: MallPublishItem, mallKey: string): Promise<Record<string, string> | null> {
  if (item.source !== 'sales_product') return null;
  const product = await salesProductApi.get(item.candidateId);
  return product.channelOverrides.find((override) => override.mallKey === mallKey)?.adapterValues ?? null;
}

export async function executeTargetRegistration(input: ExecuteTargetRegistrationInput): Promise<TargetRegistrationRun> {
  const adapterDefaults = defaultAdapterValues(input.adapter);
  const values = valuesForTarget({
    registrationInput: input.target.registrationInput,
    mallKey: input.mallKey,
    adapterDefaults,
    overrideValues: await overrideValues(input.item, input.mallKey),
    ...(input.adapterValues ? { adapterValues: input.adapterValues } : {}),
  });
  const item: MallPublishItem = {
    ...input.item,
    registrationInput: input.target.registrationInput,
    detailPageRevisionId: input.target.selectedDetailPageRevisionId,
  };
  const problems = [itemSourceProblem(input.adapter, item), ...input.adapter.validate(item, values)]
    .filter((problem): problem is string => Boolean(problem));
  if (problems.length > 0) return notStarted(problems.join(' '));

  let form: object;
  try {
    form = await input.adapter.buildForm({ item, values, ...(input.channelAccount ? { channelAccount: input.channelAccount } : {}) });
  } catch (error) {
    return notStarted(toMessage(error));
  }

  const executionKind = input.executionKind ?? 'register';
  let operationId: string;
  try {
    ({ operationId } = await startRegistrationOperation({
      mallKey: input.mallKey,
      idempotencyKey: input.idempotencyKey ?? newRegistrationIdempotencyKey(),
      scope: {
        executionKind,
        registrationTargetId: input.target.id,
        expectedVersion: input.target.version,
        submit: input.submit ?? executionKind === 'register',
        applyCompositionTemplate: input.applyCompositionTemplate ?? false,
        adapterDefaults,
        ...(input.adapterValues && Object.keys(input.adapterValues).length > 0 ? { adapterValues: input.adapterValues } : {}),
        ...(input.channelListingId ? { channelListingId: input.channelListingId } : {}),
        ...(input.optionTransitions ? { optionTransitions: input.optionTransitions } : {}),
        form: { ...form },
      },
    }));
  } catch (error) {
    if (!(error instanceof RegistrationOperationInProgress)) throw error;
    // 같은 대상의 실행이 이미 있다 — 다시 보내지 않는다. 그 실행을 읽어 보여 준다.
    const existing = error.existingOperationId ? await readRegistrationOperation(error.existingOperationId) : null;
    const outcome = existing ? registrationSendOutcome(existing) : notStarted(error.message).outcome;
    return { operation: existing, started: false, outcome: { ...outcome, warnings: [error.message, ...outcome.warnings] } };
  }
  const operation = await waitForRegistrationOperation(operationId);
  return { operation, started: true, outcome: registrationSendOutcome(operation) };
}
