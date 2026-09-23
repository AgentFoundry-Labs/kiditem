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
