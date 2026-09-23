import type { OperationStatus } from '@kiditem/shared/registration-execution';
import {
  buildRegistrationThumbnailOptions,
  type RegistrationThumbnailOption,
} from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/registration-selection';

/**
 * 몰(Wing) 반영 상태. Channels 실행 상태에서 온다 — 사진을 만든 것은 반영된 것이 아니다.
 * `checking` 은 실행이 진행 중이거나 결과를 모르는 상태(`executing` · `reconciling`)다.
 */
export type ThumbnailRegistrationState = 'registered' | 'failed' | 'checking';

export function thumbnailRegistrationState(status: OperationStatus | null | undefined): ThumbnailRegistrationState | null {
  switch (status) {
    case 'succeeded':
      return 'registered';
    case 'failed':
      return 'failed';
    case 'prepared':
    case 'executing':
    case 'reconciling':
      return 'checking';
    default:
      return null;
  }
}

export interface ThumbnailWorkspaceGeneration {
  id: string;
  status: string;
  phase?: string | null;
  registrationStatus?: ThumbnailRegistrationState | null;
  registrationError?: string | null;
  candidates: Array<{
    id?: string | null;
    url?: string | null;
  }>;
}

export type ProductWingStatus =
  | { kind: 'disabled'; label: string }
  | { kind: 'idle'; label: string }
  | { kind: 'pending'; label: string; generationId: string }
  | { kind: 'checking'; label: string; generationId: string }
  | { kind: 'failed'; label: string; generationId: string; error: string | null }
  | { kind: 'registered'; label: string; generationId: string };

export function buildThumbnailSourceOptions(input: {
  sourceImageUrls: string[];
  generations: ThumbnailWorkspaceGeneration[];
}): RegistrationThumbnailOption[] {
  return buildRegistrationThumbnailOptions(input);
}

export function getGeneratedThumbnailOptions(input: {
  sourceImageUrls: string[];
  generations: ThumbnailWorkspaceGeneration[];
}): RegistrationThumbnailOption[] {
  return buildThumbnailSourceOptions(input).filter((option) => option.kind === 'generated');
}

export function classifyProductWingStatus(input: {
  hasContentWorkspace: boolean;
  generations: ThumbnailWorkspaceGeneration[];
}): ProductWingStatus {
  if (!input.hasContentWorkspace) {
    return { kind: 'disabled', label: '상품 등록 후 Wing 업로드 가능' };
  }
  const applied = input.generations.find(
    (generation) => generation.status === 'succeeded' && generation.phase === 'applied',
  );
  if (!applied) return { kind: 'idle', label: 'Wing 등록 전' };
  if (applied.registrationStatus === 'registered') {
    return { kind: 'registered', label: 'Wing 등록 완료', generationId: applied.id };
  }
  if (applied.registrationStatus === 'failed') {
    return {
      kind: 'failed',
      label: 'Wing 등록 실패',
      generationId: applied.id,
      error: applied.registrationError ?? null,
    };
  }
  if (applied.registrationStatus === 'checking') {
    return { kind: 'checking', label: 'Wing 반영 확인 중', generationId: applied.id };
  }
  return { kind: 'pending', label: 'Wing 등록 대기', generationId: applied.id };
}
