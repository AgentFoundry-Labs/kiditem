import { isSafetyLabelImageUrl } from '../../domain/detail-page-image-order';
import type { BoldVerticalGeneration } from '../../domain/prompts/bold-vertical/single-call';
import type { DetailPageGeneration } from '../../domain/prompts/detail-page/single-call';
import type { DetailPageParsedGeneration, DetailPageTemplateId } from './detail-page-ai.types';

export function findSafetyLabelImageUrlIndices(imageUrls: string[]): Set<number> {
  const result = new Set<number>();
  imageUrls.forEach((url, index) => {
    if (isSafetyLabelImageUrl(url)) result.add(index);
  });
  return result;
}

export function pickSectionSourceImages(
  indices: number[],
  imageUrls: string[],
  excludedIndices: Set<number> = new Set(),
): string[] {
  const allowedEntries = imageUrls
    .map((url, index) => ({ url, index }))
    .filter(({ url, index }) => (
      typeof url === 'string' &&
      url.trim() !== '' &&
      !excludedIndices.has(index) &&
      !isSafetyLabelImageUrl(url)
    ));
  const picked = indices
    .filter((idx) => Number.isInteger(idx) && !excludedIndices.has(idx))
    .map((idx) => imageUrls[idx])
    .filter((url): url is string => (
      typeof url === 'string' &&
      url.trim() !== '' &&
      !isSafetyLabelImageUrl(url)
    ));
  return Array.from(new Set([...picked, ...allowedEntries.map(({ url }) => url)]));
}

export function pickSizeGuideSourceImages(
  parsed: DetailPageParsedGeneration,
  imageUrls: string[],
): string[] {
  const bold = parsed as BoldVerticalGeneration;
  const sizeIndices = bold.size?.imageIndices ?? [];
  return pickSectionSourceImages(sizeIndices, imageUrls);
}

export function countProductImages(imageUrls: string[]): number {
  return imageUrls.filter((url) => url.trim() !== '' && !isSafetyLabelImageUrl(url)).length;
}

export function cleanImageIndices(
  indices: number[] | undefined,
  imageCount: number,
  max: number,
): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const index of indices ?? []) {
    if (!Number.isInteger(index) || index < 0 || index >= imageCount) continue;
    if (seen.has(index)) continue;
    seen.add(index);
    result.push(index);
    if (result.length >= max) break;
  }
  return result;
}

export function packagePreference(
  rawInput: { rawDescription?: string; rawOptions?: string },
): 'none' | 'exists' | 'auto' {
  const raw = `${rawInput.rawDescription ?? ''}\n${rawInput.rawOptions ?? ''}`;
  if (/박스\/세트\s*정보\s*:\s*없음/u.test(raw)) return 'none';
  if (/박스\/세트\s*정보\s*:\s*있음/u.test(raw)) return 'exists';
  return 'auto';
}

export function shouldInferPackageImages(rawInput: {
  rawDescription?: string;
  rawOptions?: string;
  imageUrls: string[];
}): boolean {
  if (packagePreference(rawInput) === 'exists') return true;
  const raw = `${rawInput.rawDescription ?? ''}\n${rawInput.rawOptions ?? ''}`
    .replace(/박스\/세트\s*정보\s*:\s*AI[^\n]*/gu, '')
    .replace(/박스\/세트\s*구분\s*:\s*AI[^\n]*/gu, '');
  if (/(\d+\s*(?:개입|입|pcs|p|세트)|패키지|박스|box|package|구성품|세트\s*구성)/iu.test(raw)) {
    return true;
  }
  return rawInput.imageUrls.some((url) => /(?:box|package|pkg|set|barcode|kc|label)/iu.test(url));
}

export function colorPreference(
  rawInput: { rawDescription?: string; rawOptions?: string },
): 'none' | 'single' | 'multiple' | 'auto' {
  const raw = `${rawInput.rawDescription ?? ''}\n${rawInput.rawOptions ?? ''}`;
  if (/색상\s*구성\s*:\s*없음/u.test(raw)) return 'none';
  if (/색상\s*구성\s*:\s*단일\s*색상/u.test(raw)) return 'single';
  if (/색상\s*구성\s*:\s*여러\s*색상/u.test(raw)) return 'multiple';
  return 'auto';
}

export function normalizeUsageGuide(
  value: string,
  rawInput: { rawTitle?: string; rawCategory?: string; rawDescription?: string; rawOptions?: string },
): string {
  const existing = value
    .split(/\n|(?:^|\s)(?=\d+[.)]\s*)/u)
    .map((line) => line.replace(/^\d+[.)]\s*/u, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  if (existing.length >= 2) {
    return existing.map((line, index) => `${index + 1}. ${line}`).join('\n');
  }

  const raw = `${rawInput.rawTitle ?? ''}\n${rawInput.rawCategory ?? ''}\n${rawInput.rawDescription ?? ''}\n${rawInput.rawOptions ?? ''}`;
  const steps = [
    ...existing,
    ...fallbackUsageSteps(raw).filter((line) => !existing.includes(line)),
  ].slice(0, 3);
  return steps.map((line, index) => `${index + 1}. ${line}`).join('\n');
}

export function packageKind(
  rawInput: { rawDescription?: string; rawOptions?: string },
): 'box' | 'set' | 'auto' {
  const raw = `${rawInput.rawDescription ?? ''}\n${rawInput.rawOptions ?? ''}`;
  if (/박스\/세트\s*구분\s*:\s*박스/u.test(raw)) return 'box';
  if (/박스\/세트\s*구분\s*:\s*세트/u.test(raw)) return 'set';
  return 'auto';
}

export function extractSizeLabels(raw: string): { heightLabel: string; widthLabel: string } {
  const explicitHeight = extractExplicitSize(raw, ['높이', '세로', 'height', 'h']);
  const explicitWidth = extractExplicitSize(raw, ['가로', '너비', '폭', 'width', 'w']);
  const pair = extractWidthHeightPair(raw);
  const allSizes = Array.from(raw.matchAll(/(\d+(?:\.\d+)?)\s*(mm|cm|m)/gi))
    .map((match) => formatSizeLabel(match[1], match[2]));
  return {
    heightLabel: explicitHeight || pair?.heightLabel || allSizes[0] || '',
    widthLabel: explicitWidth || pair?.widthLabel || allSizes[1] || '',
  };
}

export function pickHeroSubhead(
  parsed: DetailPageParsedGeneration,
  templateId: DetailPageTemplateId,
): string {
  if (templateId === 'bold-vertical') {
    const hook = (parsed as BoldVerticalGeneration).hook;
    return [hook.subtext, hook.titleSub, hook.description].filter(Boolean).join(' / ');
  }
  const section1 = (parsed as DetailPageGeneration).section1;
  return section1.subhead;
}

function fallbackUsageSteps(raw: string): string[] {
  if (/비눗|버블|bubble/i.test(raw)) {
    return [
      '제품을 세워 잡고 전원을 켜세요',
      '입구가 얼굴을 향하지 않게 사용하세요',
      '사용 후 물기를 닦아 보관하세요',
    ];
  }
  if (/드론|비행|촬영/i.test(raw)) {
    return [
      '배터리를 충분히 충전하세요',
      '평평한 공간에서 전원을 켜세요',
      '사용 후 전원을 끄고 보관하세요',
    ];
  }
  if (/수제|왁스|말랑|주물럭|슬라임|촉감/i.test(raw)) {
    return [
      '포장을 열고 제품 상태를 확인하세요',
      '손으로 가볍게 눌러 촉감을 즐기세요',
      '사용 후 먼지를 닦아 보관하세요',
    ];
  }
  if (/스티커|문구|펜|노트|학용/i.test(raw)) {
    return [
      '필요한 구성품을 먼저 확인하세요',
      '원하는 위치에 맞춰 사용하세요',
      '사용 후 정리해 보관하세요',
    ];
  }
  return [
    '포장을 열고 제품 상태를 확인하세요',
    '보호자 확인 후 알맞게 사용하세요',
    '사용 후 깨끗하게 정리해 보관하세요',
  ];
}

function extractWidthHeightPair(raw: string): { widthLabel: string; heightLabel: string } | null {
  const match = raw.match(
    /(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*(?:x|×|\*|X)\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?/i,
  );
  if (!match) return null;
  const firstUnit = match[2];
  const secondUnit = match[4];
  const unit = secondUnit || firstUnit;
  if (!unit) return null;
  return {
    widthLabel: formatSizeLabel(match[1], unit),
    heightLabel: formatSizeLabel(match[3], unit),
  };
}

function extractExplicitSize(raw: string, labels: string[]): string {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?:${escaped.join('|')})\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)`, 'i');
  const match = raw.match(pattern);
  return match ? formatSizeLabel(match[1], match[2]) : '';
}

function formatSizeLabel(value: string, unit: string): string {
  const normalized = value.replace(/\.0+$/, '');
  return `${normalized}${unit.toLowerCase()}`;
}
