export type DetailGenerationMode = 'draft' | 'image' | 'full';

interface InlineProgressInput {
  templateLabel: string;
  imageProcessingStatus: string;
  rawInput?: unknown;
}

export function getDetailGenerationMode(rawInput: unknown): DetailGenerationMode {
  if (!rawInput || typeof rawInput !== 'object') return 'full';
  const value = (rawInput as Record<string, unknown>).generationMode;
  if (value === 'draft' || value === 'image') return value;
  return 'full';
}

export function getInlineGenerationProgressLabel(input: InlineProgressInput): string {
  const mode = getDetailGenerationMode(input.rawInput);
  if (mode === 'image') return `${input.templateLabel} 이미지 생성 중...`;
  return input.imageProcessingStatus === 'pending'
    ? `${input.templateLabel} 카피 생성 중...`
    : `${input.templateLabel} 이미지 생성 중...`;
}

export function getDetailGenerationStage(
  status: string,
  mode: DetailGenerationMode = 'full',
): string {
  if (mode === 'image') return 'AI 이미지 생성 중';
  if (status === 'pending') return 'AI 카피 생성 중';
  if (status === 'processing') return 'AI 이미지 합성 중';
  return '완료 처리 중';
}
