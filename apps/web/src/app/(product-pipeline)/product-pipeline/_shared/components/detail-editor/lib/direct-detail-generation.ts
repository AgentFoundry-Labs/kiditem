import type {
  DetailImageCount,
  DetailPageAgeGroup,
  DetailPageTemplateId,
} from '@kiditem/shared/ai';

type DetailGenerationRawInput = Record<string, unknown>;

export interface BuildDirectDetailGenerationBodyInput {
  generationRawInput: unknown;
  productName: string;
  productId?: string;
  contentWorkspaceId?: string | null;
  contentGenerationId?: string;
  templateId?: string | null;
  seedHookText?: string;
  seedHookTitleSub?: string;
  seedHeroImage?: string | null;
  colorGuideEnabled?: boolean;
  colorImageUrls?: string[];
}

export interface DirectDetailGenerationBody {
  rawTitle: string;
  rawCategory: string;
  rawDescription: string;
  rawOptions: string;
  imageUrls: string[];
  heroImageMode?: 'first' | 'llm-pick';
  productId?: string;
  contentWorkspaceId?: string;
  templateId: DetailPageTemplateId;
  generationMode: 'full';
  ageGroup?: DetailPageAgeGroup;
  detailImageCount?: DetailImageCount;
  usageSectionMode?: 'include' | 'exclude';
  kcCertificationStatus?: 'unknown' | 'none' | 'exists';
  kcCertificationNumber?: string;
  sourceReferences?: Array<{
    sourceType: 'content_generation';
    sourceContentGenerationId: string;
    label: string;
  }>;
}

const FALLBACK_TITLE = '상품';

export function buildDirectDetailGenerationBody(
  input: BuildDirectDetailGenerationBodyInput,
): DirectDetailGenerationBody {
  const raw = asRecord(input.generationRawInput);
  const seedHookText = input.seedHookText?.trim() ?? '';
  const seedHookTitleSub = input.seedHookTitleSub?.trim() ?? '';
  const colorImageUrls =
    input.colorGuideEnabled === true ? uniqueStrings(input.colorImageUrls ?? []) : [];

  const rawDescription = appendLines(pickString(raw.rawDescription) ?? '', [
    seedHookText ? `사용자 제목 힌트 1: ${seedHookText}` : '',
    seedHookTitleSub ? `사용자 제목 힌트 2: ${seedHookTitleSub}` : '',
  ]);

  const rawOptions = appendLines(pickString(raw.rawOptions) ?? '', [
    input.seedHeroImage ? '사용자가 선택한 히어로 이미지를 우선 반영하세요.' : '',
    colorImageUrls.length >= 2
      ? '사용자가 선택한 색상 안내 이미지를 색상/옵션 안내에 우선 반영하세요.'
      : '',
  ]);

  const body: DirectDetailGenerationBody = {
    rawTitle: normalizeProductTitle(
      pickString(raw.rawTitle) ?? input.productName ?? FALLBACK_TITLE,
    ),
    rawCategory: pickString(raw.rawCategory) ?? '',
    rawDescription,
    rawOptions,
    imageUrls: uniqueStrings([
      input.seedHeroImage ?? '',
      ...pickStringArray(raw.imageUrls),
      ...colorImageUrls,
    ]),
    heroImageMode: pickHeroImageMode(raw.heroImageMode),
    templateId: pickTemplateId(input.templateId ?? pickString(raw.templateId)),
    generationMode: 'full',
  };

  if (input.productId) body.productId = input.productId;
  if (input.contentWorkspaceId) body.contentWorkspaceId = input.contentWorkspaceId;
  if (isDetailPageAgeGroup(raw.ageGroup)) body.ageGroup = raw.ageGroup;
  if (isDetailImageCount(raw.detailImageCount)) body.detailImageCount = raw.detailImageCount;
  if (raw.usageSectionMode === 'include' || raw.usageSectionMode === 'exclude') {
    body.usageSectionMode = raw.usageSectionMode;
  }
  if (
    raw.kcCertificationStatus === 'unknown' ||
    raw.kcCertificationStatus === 'none' ||
    raw.kcCertificationStatus === 'exists'
  ) {
    body.kcCertificationStatus = raw.kcCertificationStatus;
  }
  const kcCertificationNumber = pickString(raw.kcCertificationNumber);
  if (kcCertificationNumber) body.kcCertificationNumber = kcCertificationNumber;
  if (input.contentGenerationId) {
    body.sourceReferences = [
      {
        sourceType: 'content_generation',
        sourceContentGenerationId: input.contentGenerationId,
        label: 'editor-regenerate',
      },
    ];
  }

  return body;
}

export function isDirectDetailGenerationPending(status: string | null | undefined): boolean {
  return status === 'pending' || status === 'processing';
}

export function isDirectDetailGenerationFailed(status: string | null | undefined): boolean {
  return status === 'failed' || status === 'cancelled';
}

function asRecord(value: unknown): DetailGenerationRawInput {
  return value && typeof value === 'object' ? (value as DetailGenerationRawInput) : {};
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickStringArray(value: unknown): string[] {
  return Array.isArray(value) ? uniqueStrings(value.filter((item): item is string => typeof item === 'string')) : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function appendLines(base: string, lines: string[]): string {
  const extra = lines.map((line) => line.trim()).filter(Boolean);
  return [base.trim(), ...extra].filter(Boolean).join('\n');
}

function normalizeProductTitle(value: string): string {
  const normalized = value.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return normalized || FALLBACK_TITLE;
}

function pickHeroImageMode(value: unknown): 'first' | 'llm-pick' | undefined {
  return value === 'first' || value === 'llm-pick' ? value : undefined;
}

function pickTemplateId(value: unknown): DetailPageTemplateId {
  return value === 'kids-playful' || value === 'bold-vertical' ? value : 'bold-vertical';
}

function isDetailPageAgeGroup(value: unknown): value is DetailPageAgeGroup {
  return value === 'age-8-plus' || value === 'age-14-plus';
}

function isDetailImageCount(value: unknown): value is DetailImageCount {
  return value === '1' || value === '2' || value === '3';
}
