export interface BoldVerticalProductTitle {
  first: string;
  second: string;
  displayTitle: string;
  plainTitle: string;
  heroSubtext?: string;
  heroDescription?: string;
  sectionSubtitle?: string;
}

export function buildBoldVerticalProductTitle(rawTitle: string): BoldVerticalProductTitle | null {
  const normalized = normalizeProductTitleForDisplay(rawTitle);
  if (!normalized) return null;

  const lines = splitProductTitleForBold(normalized);
  if (!lines) return null;

  const displayTitle = `${lines.first} ${lines.second}`.replace(/\s+/g, ' ').trim();
  const plainTitle = displayTitle.replace(/[!！.]$/u, '');

  return {
    ...lines,
    displayTitle,
    plainTitle,
    ...pickReferenceCopy(displayTitle),
  };
}

function splitProductTitleForBold(normalized: string): { first: string; second: string } | null {
  const necklaceBubble = normalized.match(/^(.*?목걸이)\s*(비눗방울.*)$/u);
  if (necklaceBubble?.[1] && necklaceBubble[2]) {
    return {
      first: necklaceBubble[1].trim(),
      second: ensureExcitedTitleLine(necklaceBubble[2].trim()),
    };
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    let bestIndex = 1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 1; index < tokens.length; index += 1) {
      const first = tokens.slice(0, index).join(' ');
      const second = tokens.slice(index).join(' ');
      const score = Math.abs(first.length - second.length) + Math.max(0, first.length - 14) * 2;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    return {
      first: tokens.slice(0, bestIndex).join(' '),
      second: ensureExcitedTitleLine(tokens.slice(bestIndex).join(' ')),
    };
  }

  if (normalized.length >= 6) {
    const midpoint = Math.ceil(normalized.length / 2);
    return {
      first: normalized.slice(0, midpoint),
      second: ensureExcitedTitleLine(normalized.slice(midpoint)),
    };
  }

  return null;
}

function normalizeProductTitleForDisplay(rawTitle: string): string {
  return rawTitle
    .replace(/[_|/()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/비누\s*방울/gu, '비눗방울')
    .replace(/휴대용\s*목걸이/gu, '휴대용 목걸이')
    .replace(/목걸이\s*비눗방울/gu, '목걸이 비눗방울')
    .replace(/(휴대용)(목걸이)/gu, '$1 $2')
    .replace(/(목걸이)(비눗방울)/gu, '$1 $2')
    .replace(/(곰돌이)(전동)/gu, '$1 $2')
    .replace(/(전동)(카메라)/gu, '$1 $2')
    .replace(/(카메라)(비눗방울)/gu, '$1 $2')
    .replace(/(미니)(드론)/gu, '$1 $2')
    .replace(/(버블)(건|스틱|놀이)/gu, '$1 $2')
    .replace(/(비눗방울)(세트|놀이|장난감)/gu, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureExcitedTitleLine(line: string): string {
  const cleaned = line.trim().replace(/[.!！。]+$/u, '');
  if (!cleaned) return line.trim();
  return /[가-힣]/u.test(cleaned) ? `${cleaned}!` : cleaned;
}

function pickReferenceCopy(productName: string): Pick<
  BoldVerticalProductTitle,
  'heroSubtext' | 'heroDescription' | 'sectionSubtitle'
> {
  if (/슬라임|말랑|촉감|주물럭|왁스팝/u.test(productName)) {
    return {
      heroSubtext: '말랑말랑 촉감 놀이!',
      heroDescription: '쫀득하게 주무르며 즐기는 슬라임!',
      sectionSubtitle: '손끝으로 즐기는 말랑한 촉감\n알록달록 색상으로 재미있게!',
    };
  }

  if (/비눗방울|버블/u.test(productName)) {
    return {
      heroSubtext: '우리 아이 나들이 필수템!',
      heroDescription: '목에 걸고 다니는\n귀여운 자동 비눗방울!\n잃어버릴 걱정 없이 신나요.',
      sectionSubtitle: '아이들이 직접 즐기는 재미\n잃어버릴 걱정 없이 안전하게!',
    };
  }

  if (/장난감|완구|놀이/u.test(productName)) {
    return {
      heroSubtext: '우리 아이 놀이 필수템!',
    };
  }

  return {};
}
