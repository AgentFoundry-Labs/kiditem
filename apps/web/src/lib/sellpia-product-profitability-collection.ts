import { z } from 'zod';
import { isApiError } from '@/lib/api-error';
import {
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';
import { transferExtensionAuthTo } from '@/lib/extension-auth';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browser-storage';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  beginSellpiaProductProfitabilitySourceAttempt,
  readSellpiaProductProfitabilitySourceAttempt,
} from '@/lib/sellpia-product-sales-api';
import {
  SellpiaProfitabilityAttemptSummarySchema,
  type SellpiaProfitabilityAttempt,
  type SellpiaProfitabilityAttemptSummary,
} from '@kiditem/shared/source-import';

export const SELLPIA_PRODUCT_PROFITABILITY_EXTENSION_ACTION =
  'collectSellpiaProductProfit';
export const SELLPIA_PRODUCT_PROFITABILITY_EXTENSION_CAPABILITY =
  'sellpiaProductProfitabilitySourceOwnerV1';
export const SELLPIA_PRODUCT_PROFITABILITY_CORRELATION_STORAGE_PREFIX =
  'kiditem.analytics.sellpia-product-profitability.v1';

const ExtensionOutcomeSchema = z.object({
  success: z.boolean(),
  attemptId: z.string().uuid(),
  terminalState: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  continuationRequired: z.boolean(),
  errorCode: z.string().optional(),
  error: z.string().optional(),
}).strict();

const AttemptCorrelationSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  attemptId: z.string().uuid().nullable(),
}).strict();

export type SellpiaProductProfitabilitySourceOutcome =
  SellpiaProfitabilityAttemptSummary & {
    success: boolean;
    terminalState: SellpiaProfitabilityAttemptSummary['state'];
  };

export type SellpiaProductProfitabilityCollectionScope = {
  organizationId: string;
  environmentKey?: string;
};

type AttemptCorrelation = z.infer<typeof AttemptCorrelationSchema>;
type OwnerAttempt = SellpiaProfitabilityAttempt | SellpiaProfitabilityAttemptSummary;

function environmentKey(): string {
  if (typeof window === 'undefined') return 'server';
  const origin = window.location.origin;
  return origin && origin !== 'null'
    ? origin
    : `${window.location.protocol}//${window.location.host}`;
}

export function sellpiaProductProfitabilityCorrelationStorageKey(
  scope: SellpiaProductProfitabilityCollectionScope,
): string {
  return [
    SELLPIA_PRODUCT_PROFITABILITY_CORRELATION_STORAGE_PREFIX,
    encodeURIComponent(scope.organizationId),
    encodeURIComponent(scope.environmentKey ?? environmentKey()),
  ].join(':');
}

function readCorrelation(
  scope: SellpiaProductProfitabilityCollectionScope,
): AttemptCorrelation | null {
  const raw = safeStorageGet(
    'session',
    sellpiaProductProfitabilityCorrelationStorageKey(scope),
  );
  if (!raw) return null;
  try {
    const parsed = AttemptCorrelationSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeCorrelation(
  scope: SellpiaProductProfitabilityCollectionScope,
  value: AttemptCorrelation,
): void {
  safeStorageSet(
    'session',
    sellpiaProductProfitabilityCorrelationStorageKey(scope),
    JSON.stringify(value),
  );
}

function clearCorrelation(
  scope: SellpiaProductProfitabilityCollectionScope,
  attemptId: string,
): void {
  const current = readCorrelation(scope);
  if (!current || current.attemptId !== attemptId) return;
  safeStorageRemove(
    'session',
    sellpiaProductProfitabilityCorrelationStorageKey(scope),
  );
}

function summarize(attempt: OwnerAttempt): SellpiaProfitabilityAttemptSummary {
  if ('attemptToken' in attempt) {
    const { attemptToken: _attemptToken, ...summary } = attempt;
    return SellpiaProfitabilityAttemptSummarySchema.parse(summary);
  }
  return SellpiaProfitabilityAttemptSummarySchema.parse(attempt);
}

function outcomeFromAttempt(attempt: OwnerAttempt): SellpiaProductProfitabilitySourceOutcome {
  const summary = summarize(attempt);
  return {
    ...summary,
    success: summary.state === 'COMPLETE',
    terminalState: summary.state,
  };
}

async function detectExtensionId(): Promise<string> {
  const runtime = await detectOrderCollectionExtensionRuntime(1_200, [
    SELLPIA_PRODUCT_PROFITABILITY_EXTENSION_CAPABILITY,
  ]);
  if (runtime.status === 'incompatible') {
    throw new Error('셀피아 수익성 수집을 지원하는 익스텐션으로 새로고침해 주세요.');
  }
  if (runtime.status !== 'ready') {
    throw new Error('셀피아 수익성 수집 익스텐션을 연결한 뒤 다시 시도해 주세요.');
  }
  await transferExtensionAuthTo(runtime.extensionId);
  return runtime.extensionId;
}

async function beginOrResumeAttempt(
  scope: SellpiaProductProfitabilityCollectionScope,
  correlation: AttemptCorrelation | null,
): Promise<OwnerAttempt> {
  if (correlation?.attemptId) {
    return readSellpiaProductProfitabilitySourceAttempt(correlation.attemptId);
  }
  const idempotencyKey = correlation?.idempotencyKey ?? createSecureRandomUuid();
  writeCorrelation(scope, { idempotencyKey, attemptId: null });
  const attempt = await beginSellpiaProductProfitabilitySourceAttempt({ idempotencyKey });
  writeCorrelation(scope, { idempotencyKey, attemptId: attempt.attemptId });
  return attempt;
}

async function reconcileTerminalAttempt(
  scope: SellpiaProductProfitabilityCollectionScope,
  attemptId: string,
): Promise<SellpiaProductProfitabilitySourceOutcome> {
  const attempt = await readSellpiaProductProfitabilitySourceAttempt(attemptId);
  if (attempt.state === 'RUNNING') {
    throw new Error('셀피아 수익성 수집이 아직 완료되지 않았습니다. 잠시 후 상태를 확인해주세요.');
  }
  clearCorrelation(scope, attemptId);
  return outcomeFromAttempt(attempt);
}

export async function collectSellpiaProductProfitFromExtension(
  scope: SellpiaProductProfitabilityCollectionScope,
): Promise<SellpiaProductProfitabilitySourceOutcome> {
  if (!scope.organizationId.trim()) {
    throw new Error('셀피아 수익성 수집을 시작할 조직 정보가 없습니다. 다시 로그인해 주세요.');
  }

  const correlation = readCorrelation(scope);
  let extensionId: string | null = null;
  let attempt: OwnerAttempt;

  if (correlation?.attemptId) {
    try {
      const current = await readSellpiaProductProfitabilitySourceAttempt(correlation.attemptId);
      if (current.state !== 'RUNNING') {
        return reconcileTerminalAttempt(scope, current.attemptId);
      }
      attempt = current;
    } catch (error) {
      if (!isApiError(error) || error.status !== 404) throw error;
      extensionId = await detectExtensionId();
      attempt = await beginOrResumeAttempt(scope, { ...correlation, attemptId: null });
    }
  } else {
    // Check the authoritative extension before admission so an unavailable
    // browser cannot leave an orphaned server attempt behind.
    extensionId = await detectExtensionId();
    attempt = await beginOrResumeAttempt(scope, correlation);
  }

  if (attempt.state !== 'RUNNING') {
    return reconcileTerminalAttempt(scope, attempt.attemptId);
  }
  extensionId ??= await detectExtensionId();

  let parsedResponse: z.infer<typeof ExtensionOutcomeSchema> | null = null;
  try {
    const response = await sendToExtension<unknown>(
      extensionId,
      {
        action: SELLPIA_PRODUCT_PROFITABILITY_EXTENSION_ACTION,
        attemptId: attempt.attemptId,
      },
      190_000,
    );
    parsedResponse = ExtensionOutcomeSchema.parse(response);
    if (parsedResponse.attemptId !== attempt.attemptId) {
      throw new Error('셀피아 수익성 수집 시도 응답이 일치하지 않습니다.');
    }
    if (!parsedResponse.success && parsedResponse.terminalState === 'RUNNING') {
      throw new Error('셀피아 수익성 수집이 아직 완료되지 않았습니다. 잠시 후 상태를 확인해주세요.');
    }
    return await reconcileTerminalAttempt(scope, attempt.attemptId);
  } catch (error) {
    // A terminal write may have committed even when the extension response or
    // response-side status read was lost. Reconcile without collecting again.
    try {
      return await reconcileTerminalAttempt(scope, attempt.attemptId);
    } catch {
      if (parsedResponse && parsedResponse.terminalState !== 'RUNNING') {
        return outcomeFromAttempt({
          ...attempt,
          state: parsedResponse.terminalState,
          errorCode: parsedResponse.errorCode ?? null,
          errorMessage: parsedResponse.error ?? null,
        });
      }
      throw error;
    }
  }
}
