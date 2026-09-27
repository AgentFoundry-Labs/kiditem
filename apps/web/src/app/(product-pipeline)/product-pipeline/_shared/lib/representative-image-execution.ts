import { THUMBNAIL_LISTING_CHOICE_REQUIRED_CODE, type ThumbnailExecutionListingChoice } from '@kiditem/shared/thumbnail-execution';
import type { OperationStatus } from '@kiditem/shared/operation';
import { CHANNEL_REGISTRY } from '@kiditem/shared/channel-registry';
import {
  closeRegistrationOperation,
  confirmRegistrationOperation,
  newRegistrationIdempotencyKey,
  readRegistrationOperation,
  startRegistrationOperation,
  waitForRegistrationOperation,
  type RegistrationOperationRead,
} from '@/app/(channels)/_shared/registration-operation';
import { apiClient } from '@/lib/api-client';
import { OperationStartFailure } from '@/lib/operation-start';

/**
 * 대표이미지 몰 반영 = 등록 실행 `channels.registration` · `thumbnail_update` 하나(KID-364). 어느 몰 계정에 올릴지는 서버
 * plan이 레지스트리의 `representativeImage` 능력으로 정하고, 확장 몰 쓰기 모듈이 몰 상품 수정 화면의 대표이미지 칸에
 * 올린다. 올린 것은 저장이 아니다 — 실행은 `reconciling`(확인 중)에 멈추고, 운영자가 몰에서 저장한 뒤 "반영됨"으로
 * 확인하거나 "반영 안 됨"으로 닫는다. 이 파일은 몰 이름을 박지 않는다(화면 글자의 채널 이름은 레지스트리에서 읽는다).
 */

/** 대표이미지를 받아 주는 채널. 준비 응답이 없으므로 레지스트리에서 읽는다. */
function representativeImageChannels() {
  return CHANNEL_REGISTRY.filter((entry) => entry.representativeImage);
}

function representativeImageChannelName(): string {
  const names = representativeImageChannels().map((entry) => entry.name);
  return names.length > 0 ? names.join('·') : '몰';
}

/** 쓰기 사이트·저장 자격을 고를 몰 키. 대표이미지를 받는 채널이 하나일 때 그 키다. */
function representativeImageMallKey(): string {
  const [channel] = representativeImageChannels();
  if (!channel) throw new Error('대표이미지를 받는 몰이 없습니다.');
  return channel.key;
}

/** 화면이 보는 한 실행. `executionId`는 등록 실행 id다. */
export interface RepresentativeImageExecutionResult {
  salesProductId: string;
  assetId: string | null;
  executionId: string;
  /** 몰이 저장까지 확인됐다(운영자 "반영됨" 포함). */
  success: boolean;
  status: OperationStatus;
  screenshotPath: string | null;
  error?: string;
}

/**
 * 올릴 대표이미지(KID-313 W3a). 판매 상품과, 고른 자산이 있으면 그 자산 — 없으면 서버가 등록 대상이 고른 자산,
 * 그것도 없으면 작업공간의 현재 대표이미지를 쓴다.
 */
export interface RepresentativeImageSubject {
  salesProductId: string;
  assetId?: string | null;
}

/** 판매상품에 대표이미지를 받는 채널의 리스팅이 여럿이라 운영자가 하나를 골라야 한다. 확장에는 아무것도 보내지 않았다. */
export class ListingChoiceRequiredError extends Error {
  constructor(readonly salesProductId: string, message: string) {
    super(message);
    this.name = 'ListingChoiceRequiredError';
  }
}

function resultOf(read: RegistrationOperationRead, subject: RepresentativeImageSubject): RepresentativeImageExecutionResult {
  return {
    salesProductId: subject.salesProductId,
    assetId: subject.assetId ?? null,
    executionId: read.operation.id,
    success: read.state === 'confirmed',
    status: read.operation.status,
    screenshotPath: null,
    ...(read.message ? { error: read.message } : {}),
  };
}

function planText(read: RegistrationOperationRead, key: string): string | null {
  const value = read.operation.plan?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

async function startThumbnail(subject: RepresentativeImageSubject, channelListingId?: string): Promise<RepresentativeImageExecutionResult> {
  let operationId: string;
  try {
    ({ operationId } = await startRegistrationOperation({
      mallKey: representativeImageMallKey(),
      idempotencyKey: newRegistrationIdempotencyKey('thumbnail'),
      scope: {
        executionKind: 'thumbnail_update',
        salesProductId: subject.salesProductId,
        ...(subject.assetId ? { assetId: subject.assetId } : {}),
        ...(channelListingId ? { channelListingId } : {}),
      },
    }));
  } catch (error) {
    if (error instanceof OperationStartFailure && error.code === THUMBNAIL_LISTING_CHOICE_REQUIRED_CODE) {
      throw new ListingChoiceRequiredError(subject.salesProductId, error.message);
    }
    throw error;
  }
  const read = await waitForRegistrationOperation(operationId);
  if (read.state === 'failed' || read.state === 'cancelled') {
    throw new Error(read.message ?? '확장 프로그램이 대표이미지를 올리지 못했습니다.');
  }
  return resultOf(read, subject);
}

/** 대표이미지를 몰 상품 수정 화면에 올린다(등록 실행 하나). 올린 것은 반영이 아니다. */
export function submitRepresentativeImageViaExtension(
  subject: RepresentativeImageSubject,
  options: { channelListingId?: string } = {},
): Promise<RepresentativeImageExecutionResult> {
  return startThumbnail(subject, options.channelListingId);
}

/** 운영자가 고를 수 있는 이 판매 상품의 리스팅. */
export async function fetchRepresentativeImageListingChoices(salesProductId: string): Promise<ThumbnailExecutionListingChoice[]> {
  const response = await apiClient.get<{ items: ThumbnailExecutionListingChoice[] }>(
    `/api/channels/thumbnail-executions/listing-choices?salesProductId=${encodeURIComponent(salesProductId)}`,
  );
  return response?.items ?? [];
}

/**
 * 결과를 모르는("확인 중") 실행을 다시 보낸다. 같은 실행을 두 번 보내지 않는다 — 그 실행을 닫고 같은 판매 상품 ·
 * 리스팅으로 새 실행을 연다(자산은 서버가 등록 대상이 고른 것 → 작업공간 현재 대표이미지 순으로 정한다).
 */
export async function resendRepresentativeImageViaExtension(executionId: string): Promise<RepresentativeImageExecutionResult> {
  const read = await readRegistrationOperation(executionId);
  const salesProductId = planText(read, 'salesProductId');
  if (!salesProductId) throw new Error('다시 보낼 판매 상품을 확인하지 못했습니다.');
  if (read.state === 'needs_confirmation') await closeRegistrationOperation(executionId, '운영자가 다시 보내기로 닫음');
  return startThumbnail({ salesProductId }, planText(read, 'channelListingId') ?? undefined);
}

/** 운영자의 "반영됨으로 표시" — 몰 상품 수정 화면에서 저장한 것을 확인했다. 그 몰 상품번호로 실행을 확인한다. */
export async function confirmRepresentativeImageApplied(executionId: string): Promise<RepresentativeImageExecutionResult> {
  const read = await readRegistrationOperation(executionId);
  const externalListingId = planText(read, 'externalListingId') ?? read.result?.externalListingId ?? null;
  if (!externalListingId) throw new Error('이 실행의 몰 상품번호를 확인하지 못했습니다.');
  const confirmed = await confirmRegistrationOperation(executionId, { externalListingId });
  return resultOf(confirmed ?? read, { salesProductId: planText(read, 'salesProductId') ?? '' });
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
export async function markRepresentativeImageNotApplied(executionId: string): Promise<RepresentativeImageExecutionResult | null> {
  const closed = await closeRegistrationOperation(executionId, '운영자가 몰에서 확인: 반영되지 않음');
  return closed ? resultOf(closed, { salesProductId: planText(closed, 'salesProductId') ?? '' }) : null;
}

/** 확장이 몰 상품 수정 화면에 올렸고 운영자의 저장 확인을 기다린다(또는 이미 확인됐다). */
export function representativeImageUploadReached(result: RepresentativeImageExecutionResult): boolean {
  return result.success || result.status === 'reconciling';
}
