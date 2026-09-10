import { z } from 'zod';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { transferExtensionAuthTo } from '@/lib/extension-auth';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  beginSellpiaSalesSourceAttempt,
  readSellpiaSalesSourceAttempt,
  type SellpiaSalesSourceAttempt,
  type SellpiaSalesSourceOutcome,
} from '@/lib/sellpia-sales-api';

// Sellpia sale_summary source owner bridge.
// The page starts a frozen server attempt; the extension reads that plan and
// uploads the provider payload directly to the owner terminal endpoint.

const REQUIRED_CAPABILITY = 'collectSellpiaSaleSummaryAuthoritativeV1';
const EXTENSION_ACTION = 'collectSellpiaSaleSummary';

const ExtensionOutcomeSchema = z.object({
  success: z.boolean(),
  attemptId: z.string().uuid(),
  terminalState: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  continuationRequired: z.boolean(),
  errorCode: z.string().optional(),
  error: z.string().optional(),
}).strict();

type ExtensionOutcome = z.infer<typeof ExtensionOutcomeSchema>;

const MAX_EXTENSION_ERROR_LENGTH = 300;

function outcomeFromAttempt(attempt: SellpiaSalesSourceAttempt): SellpiaSalesSourceOutcome {
  return {
    ...attempt,
    success: attempt.state === 'COMPLETE',
    terminalState: attempt.state,
  };
}

async function detectExtensionId(): Promise<string> {
  const extensionId = await detectOrderCollectionExtensionId(1200, REQUIRED_CAPABILITY);
  if (extensionId) return extensionId;
  throw new Error(
    '안전한 판매현황 수집 기능이 필요합니다. extensions/kiditem-os를 Chrome에서 새로고침하고 kiditem.sellpia.com에 로그인한 뒤 다시 시도해주세요.',
  );
}

async function reconcileTerminalAttempt(attemptId: string): Promise<SellpiaSalesSourceOutcome> {
  const attempt = await readSellpiaSalesSourceAttempt(attemptId);
  if (attempt.state === 'RUNNING') {
    throw new Error('셀피아 판매현황 수집이 아직 완료되지 않았습니다. 잠시 후 상태를 확인해주세요.');
  }
  return outcomeFromAttempt(attempt);
}

function extensionFailureMessage(outcome: ExtensionOutcome): string | null {
  if (outcome.success || outcome.continuationRequired) return null;
  const detail = [outcome.errorCode, outcome.error]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(': ')
    .trim();
  return detail ? detail.slice(0, MAX_EXTENSION_ERROR_LENGTH) : null;
}

export async function collectSellpiaSaleSummaryFromExtension(opts: {
  startDate?: string;
  endDate?: string;
} = {}): Promise<SellpiaSalesSourceOutcome> {
  const idempotencyKey = createSecureRandomUuid();
  const attempt = await beginSellpiaSalesSourceAttempt({
    idempotencyKey,
    from: opts.startDate,
    to: opts.endDate,
  });
  if (attempt.state !== 'RUNNING') return outcomeFromAttempt(attempt);

  const extensionId = await detectExtensionId();
  await transferExtensionAuthTo(extensionId);
  let parsed: ExtensionOutcome;
  try {
    const response = await sendToExtension<unknown>(
      extensionId,
      { action: EXTENSION_ACTION, attemptId: attempt.attemptId },
      190_000,
    );
    parsed = ExtensionOutcomeSchema.parse(response);
    if (parsed.attemptId !== attempt.attemptId) {
      throw new Error('셀피아 판매현황 수집 시도 응답이 일치하지 않습니다.');
    }
  } catch (error) {
    // The extension may have committed the terminal transaction and lost the
    // parent-page response. A read-only attempt reconciliation preserves that
    // completion without retrying provider work or masking a still-running run.
    try {
      return await reconcileTerminalAttempt(attempt.attemptId);
    } catch {
      throw error;
    }
  }

  let observed: SellpiaSalesSourceAttempt;
  try {
    observed = await readSellpiaSalesSourceAttempt(attempt.attemptId);
  } catch (error) {
    // A terminal write may have committed even when the first status read was
    // lost. Reconcile once more without collecting again.
    try {
      return await reconcileTerminalAttempt(attempt.attemptId);
    } catch {
      throw error;
    }
  }
  if (observed.state !== 'RUNNING') return outcomeFromAttempt(observed);

  const extensionError = extensionFailureMessage(parsed);
  if (extensionError) throw new Error(extensionError);
  throw new Error('셀피아 판매현황 수집이 아직 완료되지 않았습니다. 잠시 후 상태를 확인해주세요.');
}
