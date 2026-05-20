import {
  buildRegistrationThumbnailOptions,
  type RegistrationThumbnailOption,
} from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/registration-selection';

export interface ThumbnailWorkspaceGeneration {
  id: string;
  status: string;
  phase?: string | null;
  registrationStatus?: string | null;
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
  return { kind: 'pending', label: 'Wing 등록 대기', generationId: applied.id };
}
