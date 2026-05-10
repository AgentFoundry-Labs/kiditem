import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';

export const EXTENSION_REQUIRED_MESSAGE =
  '스테이징에서는 쿠팡 Wing 등록을 Chrome 확장 프로그램으로만 실행할 수 있습니다. 확장 프로그램을 설치/새로고침한 뒤 다시 시도하세요.';

export interface WingRegistrationImagePayload {
  dataUrl: string;
  filename: string;
  mimeType: string;
}

export interface WingRegistrationPrepareResponse {
  attemptId: string;
  generationId: string;
  productName: string;
  image: WingRegistrationImagePayload;
}

export interface WingRegistrationResult {
  success: boolean;
  screenshotPath: string | null;
  error?: string;
}

interface ExtensionWingRegistrationResponse {
  success?: boolean;
  error?: string;
  pendingLogin?: boolean;
  screenshotUrl?: string;
}

export async function registerWingThumbnailViaExtension(
  generationId: string,
): Promise<WingRegistrationResult> {
  const extensionId = await detectExtensionId();
  if (!extensionId) {
    throw new Error(EXTENSION_REQUIRED_MESSAGE);
  }

  const prepared = await apiClient.post<WingRegistrationPrepareResponse>(
    `/api/thumbnail-analysis/generations/${generationId}/wing-register/prepare`,
    {},
  );

  let extensionResult: ExtensionWingRegistrationResponse;
  try {
    extensionResult = await sendToExtension<ExtensionWingRegistrationResponse>(extensionId, {
      action: 'registerWingThumbnail',
      attemptId: prepared.attemptId,
      generationId: prepared.generationId,
      productName: prepared.productName,
      image: prepared.image,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeFailedRegistration(generationId, prepared.attemptId, message);
    throw new Error(message);
  }

  if (!extensionResult?.success) {
    const message =
      extensionResult?.error ??
      (extensionResult?.pendingLogin
        ? '쿠팡 Wing 로그인 필요 — 열린 Wing 탭에서 로그인 후 다시 시도하세요.'
        : '쿠팡 Wing 확장 프로그램 업로드 실패');
    const completed = await completeFailedRegistration(generationId, prepared.attemptId, message);
    throw new Error(completed.error ?? message);
  }

  return apiClient.post<WingRegistrationResult>(
    `/api/thumbnail-analysis/generations/${generationId}/wing-register/complete`,
    {
      attemptId: prepared.attemptId,
      success: true,
      screenshotUrl: extensionResult.screenshotUrl,
    },
  );
}

function completeFailedRegistration(
  generationId: string,
  attemptId: string,
  error: string,
): Promise<WingRegistrationResult> {
  return apiClient.post<WingRegistrationResult>(
    `/api/thumbnail-analysis/generations/${generationId}/wing-register/complete`,
    {
      attemptId,
      success: false,
      error,
    },
  );
}
