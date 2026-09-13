import { z } from 'zod';
import {
  AdAccountDailyKpiSourceAttemptSchema,
  AdAccountDailyKpiSourceStatusSchema,
  type AdAccountDailyKpiSourceAttempt,
  type AdAccountDailyKpiSourceStatus,
} from '@kiditem/shared/advertising';
import { apiClient } from '@/lib/api-client';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { transferExtensionAuthTo } from '@/lib/extension-auth';

export const AD_ACCOUNT_DAILY_KPI_SOURCE_PATH = '/api/ads/account-daily-kpis';
export const AD_ACCOUNT_DAILY_KPI_ATTEMPT_STORAGE_KEY =
  'kiditem:readiness:ad-account-daily-kpi-attempt';
export const AD_ACCOUNT_DAILY_KPI_EXTENSION_ACTION =
  'collectAdvertisingAccountDailyKpis';
export const AD_ACCOUNT_DAILY_KPI_EXTENSION_CAPABILITY =
  'advertisingAccountDailyKpiSourceOwnerV1';

export type ActiveAdAccountDailyKpiAttempt = {
  attemptId: string | null;
  idempotencyKey: string | null;
};

const ActiveAdAccountDailyKpiAttemptSchema = AdAccountDailyKpiSourceAttemptSchema
  .pick({ attemptId: true })
  .extend({
    attemptId: AdAccountDailyKpiSourceAttemptSchema.shape.attemptId.nullable(),
    idempotencyKey: z.string().uuid().nullable(),
  })
  .strict();

export function readActiveAdAccountDailyKpiAttempt(): ActiveAdAccountDailyKpiAttempt | null {
  const raw = safeStorageGet('local', AD_ACCOUNT_DAILY_KPI_ATTEMPT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = ActiveAdAccountDailyKpiAttemptSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function rememberAdAccountDailyKpiAttempt(
  attempt: ActiveAdAccountDailyKpiAttempt,
): void {
  safeStorageSet(
    'local',
    AD_ACCOUNT_DAILY_KPI_ATTEMPT_STORAGE_KEY,
    JSON.stringify(attempt),
  );
}

export async function readAdAccountDailyKpiSource(): Promise<AdAccountDailyKpiSourceStatus> {
  return AdAccountDailyKpiSourceStatusSchema.parse(
    await apiClient.get(`${AD_ACCOUNT_DAILY_KPI_SOURCE_PATH}/source`),
  );
}

export async function beginAdAccountDailyKpiAttempt(
  idempotencyKey: string,
): Promise<AdAccountDailyKpiSourceAttempt> {
  return AdAccountDailyKpiSourceAttemptSchema.parse(
    await apiClient.post(
      `${AD_ACCOUNT_DAILY_KPI_SOURCE_PATH}/attempts`,
      {},
      { headers: { 'Idempotency-Key': idempotencyKey } },
    ),
  );
}

export async function readAdAccountDailyKpiAttempt(
  attemptId: string,
): Promise<AdAccountDailyKpiSourceAttempt> {
  const attempt = AdAccountDailyKpiSourceAttemptSchema.parse(
    await apiClient.get(`${AD_ACCOUNT_DAILY_KPI_SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}`),
  );
  if (attempt.attemptId !== attemptId) {
    throw new Error('광고 계정 일별 KPI 수집 시도 응답이 일치하지 않습니다.');
  }
  return attempt;
}

export async function prepareAdAccountDailyKpiExtension(): Promise<string> {
  const extensionId = await detectExtensionId();
  if (!extensionId) {
    throw new Error('브라우저 수집 익스텐션을 찾을 수 없습니다.');
  }
  const ping = await sendToExtension<{
    success?: boolean;
    capabilities?: Record<string, unknown>;
  }>(extensionId, { action: 'ping' });
  if (
    !ping?.success ||
    ping.capabilities?.[AD_ACCOUNT_DAILY_KPI_EXTENSION_CAPABILITY] !== true
  ) {
    throw new Error('광고 일별 KPI 수집을 지원하는 익스텐션으로 새로고침해 주세요.');
  }
  await transferExtensionAuthTo(extensionId);
  return extensionId;
}

export async function startAdAccountDailyKpiBrowser(
  extensionId: string,
  attemptId: string,
): Promise<void> {
  const response = await sendToExtension<{ success?: boolean; error?: string }>(
    extensionId,
    { action: AD_ACCOUNT_DAILY_KPI_EXTENSION_ACTION, attemptId },
    35 * 60_000,
  );
  if (response?.success === false) {
    throw new Error(response.error ?? '광고 계정 일별 KPI 수집을 시작하지 못했습니다.');
  }
}
