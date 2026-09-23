import type {
  ThumbnailExecutionPrepareResponse,
  ThumbnailExecutionReportRequest,
  ThumbnailExecutionResult,
} from '@kiditem/shared/thumbnail-execution';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';

export const EXTENSION_REQUIRED_MESSAGE =
  '스테이징에서는 쿠팡 Wing 등록을 Chrome 확장 프로그램으로만 실행할 수 있습니다. 확장 프로그램을 설치/새로고침한 뒤 다시 시도하세요.';

const PENDING_LOGIN_MESSAGE = '쿠팡 Wing 로그인 필요 — 열린 Wing 탭에서 로그인 후 다시 시도하세요.';
const EXTENSION_FAILED_MESSAGE = '쿠팡 Wing 확장 프로그램 업로드 실패';

export type WingRegistrationResult = ThumbnailExecutionResult;

interface ExtensionWingRegistrationResponse {
  success?: boolean;
  error?: string;
  pendingLogin?: boolean;
  screenshotUrl?: string;
}

/**
 * 대표이미지 몰 반영(Channels 실행) — 준비 → 확장 업로드 → 보고.
 *
 * 확장이 실패라고 답하면(로그인 대기 포함) 아무것도 올라가지 않은 것이라 `definitive_failure`,
 * 확장과의 통신 자체가 끊기면 올라갔는지 모르므로 `uncertain` 으로 보고한다.
 */
export async function registerWingThumbnailViaExtension(generationId: string): Promise<WingRegistrationResult> {
  const extensionId = await requireExtension();
  const prepared = await apiClient.post<ThumbnailExecutionPrepareResponse>('/api/channels/thumbnail-executions', {
    generationId,
  });
  return uploadAndReport(extensionId, prepared);
}

/** 결과를 모르는("확인 중") 같은 실행을 확장에 다시 보내고 그 실행에 보고한다. */
export async function resendWingThumbnailViaExtension(executionId: string): Promise<WingRegistrationResult> {
  const extensionId = await requireExtension();
  const prepared = await apiClient.post<ThumbnailExecutionPrepareResponse>(
    `/api/channels/thumbnail-executions/${executionId}/resend`,
    {},
  );
  return uploadAndReport(extensionId, prepared);
}

/** 운영자의 "반영 안 됨으로 표시". 같은 생성에 새 반영을 열어 준다. */
export function markWingThumbnailNotApplied(executionId: string): Promise<WingRegistrationResult> {
  return apiClient.post<WingRegistrationResult>(`/api/channels/thumbnail-executions/${executionId}/not-applied`, {});
}

async function requireExtension(): Promise<string> {
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error(EXTENSION_REQUIRED_MESSAGE);
  return extensionId;
}

async function uploadAndReport(extensionId: string, prepared: ThumbnailExecutionPrepareResponse): Promise<WingRegistrationResult> {
  let extensionResult: ExtensionWingRegistrationResponse;
  try {
    extensionResult = await sendToExtension<ExtensionWingRegistrationResponse>(extensionId, {
      action: 'registerWingThumbnail',
      attemptId: prepared.executionId,
      generationId: prepared.generationId,
      productName: prepared.productName,
      image: prepared.image,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await report(prepared.executionId, { outcome: 'uncertain', error: message || EXTENSION_FAILED_MESSAGE });
    throw new Error(message);
  }

  if (!extensionResult?.success) {
    const message =
      extensionResult?.error ?? (extensionResult?.pendingLogin ? PENDING_LOGIN_MESSAGE : EXTENSION_FAILED_MESSAGE);
    const reported = await report(prepared.executionId, { outcome: 'definitive_failure', error: message });
    throw new Error(reported?.error ?? message);
  }

  return report(prepared.executionId, {
    outcome: 'succeeded',
    ...(extensionResult.screenshotUrl ? { screenshotUrl: extensionResult.screenshotUrl } : {}),
  });
}

function report(executionId: string, body: ThumbnailExecutionReportRequest): Promise<WingRegistrationResult> {
  return apiClient.post<WingRegistrationResult>(`/api/channels/thumbnail-executions/${executionId}/report`, body);
}
