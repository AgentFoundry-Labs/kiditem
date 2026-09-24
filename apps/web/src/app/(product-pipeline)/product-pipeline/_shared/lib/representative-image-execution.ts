import {
  THUMBNAIL_LISTING_CHOICE_REQUIRED_CODE,
  type ThumbnailExecutionListingChoice,
  type ThumbnailExecutionPrepareResponse,
  type ThumbnailExecutionReportRequest,
  type ThumbnailExecutionResult,
} from '@kiditem/shared/thumbnail-execution';
import { CHANNEL_REGISTRY } from '@kiditem/shared/channel-registry';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';

/**
 * 대표이미지 몰 반영(Channels `thumbnail_update` 실행, KID-321) — 준비 → 확장 업로드 → 보고. 어느 몰 계정에
 * 올릴지는 서버가 레지스트리의 `representativeImage` 능력으로 정하고, 이 파일은 몰 이름을 박지 않는다.
 * 화면 글자에 들어가는 채널 이름은 레지스트리에서 읽는다.
 */

/**
 * 대표이미지를 받아 주는 채널의 이름. 준비 응답은 계정의 채널을 싣지 않으므로 레지스트리에서 읽는다.
 */
function representativeImageChannelName(): string {
  const names = CHANNEL_REGISTRY.filter((entry) => entry.representativeImage).map((entry) => entry.name);
  return names.length > 0 ? names.join('·') : '몰';
}

export const EXTENSION_REQUIRED_MESSAGE =
  '대표이미지 반영은 Chrome 확장 프로그램으로만 실행할 수 있습니다. 확장 프로그램을 설치/새로고침한 뒤 다시 시도하세요.';

const pendingLoginMessage = () =>
  `${representativeImageChannelName()} 로그인 필요 — 열린 탭에서 로그인한 뒤 다시 시도하세요.`;
const EXTENSION_FAILED_MESSAGE = '확장 프로그램이 대표이미지를 올리지 못했습니다';

export type RepresentativeImageExecutionResult = ThumbnailExecutionResult;

interface ExtensionRepresentativeImageResponse {
  success?: boolean;
  error?: string;
  pendingLogin?: boolean;
  screenshotUrl?: string;
}

/**
 * 준비 → 확장 업로드 → 보고. 올린 것은 저장이 아니므로 결과는 `status: 'reconciling'` 이고, 운영자가 몰 상품
 * 수정 화면에서 저장한 뒤 `confirmRepresentativeImageApplied` 로 끝낸다.
 *
 * 확장이 실패라고 답하면(로그인 대기 포함) 아무것도 올라가지 않은 것이라 `definitive_failure`,
 * 확장과의 통신 자체가 끊기면 올라갔는지 모르므로 `uncertain` 으로 보고한다.
 */
/**
 * 올릴 대표이미지(KID-313 W3a). 판매 상품과, 고른 자산이 있으면 그 자산 — 없으면 서버가 등록 대상이 고른 자산,
 * 그것도 없으면 작업공간의 현재 대표이미지를 쓴다.
 */
export interface RepresentativeImageSubject {
  salesProductId: string;
  assetId?: string | null;
}

export async function submitRepresentativeImageViaExtension(
  subject: RepresentativeImageSubject,
  options: { channelListingId?: string } = {},
): Promise<RepresentativeImageExecutionResult> {
  const extensionId = await requireExtension();
  let prepared: ThumbnailExecutionPrepareResponse;
  try {
    prepared = await apiClient.post<ThumbnailExecutionPrepareResponse>('/api/channels/thumbnail-executions', {
      salesProductId: subject.salesProductId,
      ...(subject.assetId ? { assetId: subject.assetId } : {}),
      ...(options.channelListingId ? { channelListingId: options.channelListingId } : {}),
    });
  } catch (error) {
    if (isApiError(error) && error.details.reason === THUMBNAIL_LISTING_CHOICE_REQUIRED_CODE) {
      throw new ListingChoiceRequiredError(subject.salesProductId, error.message);
    }
    throw error;
  }
  return uploadAndReport(extensionId, prepared);
}

/** 판매상품에 대표이미지를 받는 채널의 리스팅이 여럿이라 운영자가 하나를 골라야 한다. 확장에는 아무것도 보내지 않았다. */
export class ListingChoiceRequiredError extends Error {
  constructor(readonly salesProductId: string, message: string) {
    super(message);
    this.name = 'ListingChoiceRequiredError';
  }
}

/** 운영자가 고를 수 있는 이 판매 상품의 리스팅. */
export async function fetchRepresentativeImageListingChoices(salesProductId: string): Promise<ThumbnailExecutionListingChoice[]> {
  const response = await apiClient.get<{ items: ThumbnailExecutionListingChoice[] }>(
    `/api/channels/thumbnail-executions/listing-choices?salesProductId=${encodeURIComponent(salesProductId)}`,
  );
  return response?.items ?? [];
}

/** 결과를 모르는("확인 중") 같은 실행을 확장에 다시 보내고 그 실행에 보고한다. */
export async function resendRepresentativeImageViaExtension(executionId: string): Promise<RepresentativeImageExecutionResult> {
  const extensionId = await requireExtension();
  const prepared = await apiClient.post<ThumbnailExecutionPrepareResponse>(
    `/api/channels/thumbnail-executions/${executionId}/resend`,
    {},
  );
  return uploadAndReport(extensionId, prepared);
}

/** 운영자의 "반영됨으로 표시" — 몰 상품 수정 화면에서 저장한 것을 확인했다. */
export function confirmRepresentativeImageApplied(executionId: string): Promise<RepresentativeImageExecutionResult> {
  return apiClient.post<RepresentativeImageExecutionResult>(`/api/channels/thumbnail-executions/${executionId}/applied`, {});
}

/** 확장이 몰 상품 수정 화면에 올렸고 운영자의 저장 확인을 기다린다(또는 이미 확인됐다). */
export function representativeImageUploadReached(result: RepresentativeImageExecutionResult): boolean {
  return result.success || result.status === 'reconciling';
}

/** 대표이미지를 몰 상품 수정 화면에 올린 뒤의 안내. 올린 것은 반영이 아니다 — 저장 뒤 운영자가 표시한다. */
export function representativeImageUploadedMessage(
  input: { uploaded?: number; failed?: number; resent?: boolean } = {},
): string {
  const screen = `${representativeImageChannelName()} 상품 수정 화면에`;
  if (input.failed && input.failed > 0) {
    return `${screen} ${input.uploaded ?? 0}장 올림 / 실패 ${input.failed} — 올린 것은 저장 뒤 반영됨으로 표시하세요`;
  }
  const what = input.resent ? '다시 올렸습니다' : input.uploaded !== undefined ? `${input.uploaded}장 올렸습니다` : '올렸습니다';
  return `${screen} ${what} — 저장한 뒤 반영됨으로 표시하세요`;
}

/** 운영자의 "반영 안 됨으로 표시". 같은 자산에 새 반영을 열어 준다. */
export function markRepresentativeImageNotApplied(executionId: string): Promise<RepresentativeImageExecutionResult> {
  return apiClient.post<RepresentativeImageExecutionResult>(`/api/channels/thumbnail-executions/${executionId}/not-applied`, {});
}

async function requireExtension(): Promise<string> {
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error(EXTENSION_REQUIRED_MESSAGE);
  return extensionId;
}

async function uploadAndReport(extensionId: string, prepared: ThumbnailExecutionPrepareResponse): Promise<RepresentativeImageExecutionResult> {
  let extensionResult: ExtensionRepresentativeImageResponse;
  try {
    extensionResult = await sendToExtension<ExtensionRepresentativeImageResponse>(extensionId, {
      action: 'registerRepresentativeImage',
      attemptId: prepared.executionId,
      salesProductId: prepared.salesProductId,
      assetId: prepared.assetId,
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
      extensionResult?.error ?? (extensionResult?.pendingLogin ? pendingLoginMessage() : EXTENSION_FAILED_MESSAGE);
    const reported = await report(prepared.executionId, { outcome: 'definitive_failure', error: message });
    throw new Error(reported?.error ?? message);
  }

  // 확장은 몰 상품 수정 화면의 대표이미지 칸에 넣을 뿐 저장하지 않는다 — 운영자가 저장하고 확인해야 반영이다.
  return report(prepared.executionId, {
    outcome: 'uploaded_pending_save',
    ...(extensionResult.screenshotUrl ? { screenshotUrl: extensionResult.screenshotUrl } : {}),
  });
}

function report(executionId: string, body: ThumbnailExecutionReportRequest): Promise<RepresentativeImageExecutionResult> {
  return apiClient.post<RepresentativeImageExecutionResult>(`/api/channels/thumbnail-executions/${executionId}/report`, body);
}
