import type {
  DetailImageCount,
  DetailPageAgeGroup,
} from '@kiditem/shared/ai';
import type {
  BoxSetStatus,
  ColorVariantStatus,
  KcCertificationStatus,
  UsageSectionMode,
} from './detail-page-generation-options';

export function buildAgeGroupInstruction(ageGroup: DetailPageAgeGroup): string {
  if (ageGroup === 'age-14-plus') {
    return [
      '사용 연령 기준: 14세 이상 상품',
      '문구와 이미지의 실제 사용자는 아이가 아니라 중고등학생/청소년/학생으로 표현하세요.',
      '유아·어린아이·초등 저학년처럼 보이는 장면, 말투, 모델은 피하세요.',
    ].join('\n');
  }

  return [
    '사용 연령 기준: 8세 이상 상품',
    '문구와 이미지의 실제 사용자는 8세 이상 어린이/초등학생 기준으로 표현하세요.',
    '유아·영아처럼 너무 어린 장면은 피하세요.',
  ].join('\n');
}

export function buildDetailImageCountInstruction(detailImageCount: DetailImageCount): string {
  return `DETAIL 이미지 수: ${detailImageCount}개`;
}

export function buildUsageSectionInstruction(usageSectionMode: UsageSectionMode): string {
  if (usageSectionMode === 'exclude') {
    return [
      '사용법 영역: 만들지 않음',
      '상세페이지에 사용법 안내/사용 순서/튜토리얼 섹션을 만들지 마세요.',
      'BoldVertical 출력에서는 usage.subtitle는 빈 문자열, usage.imageIndices는 빈 배열로 두세요.',
      '사용법 전용 이미지는 생성하지 말고 DETAIL 본문 이미지만 구성하세요.',
    ].join('\n');
  }

  return [
    '사용법 영역: 포함',
    '실제 사용 흐름이 필요한 상품이면 사용법 안내 섹션을 만드세요.',
    '사용법/설명서 이미지가 있으면 usage 영역에 분리하세요.',
  ].join('\n');
}

export function buildKcCertificationInstruction(
  status: KcCertificationStatus,
  number: string,
): string {
  const kcNumber = normalizeKcCertificationNumber(number);
  if (status === 'none') {
    return [
      'KC 인증번호: 없음',
      'KC 번호를 추정해서 만들지 마세요.',
      '안전표시/KC/바코드 이미지가 있으면 제품정보 표를 만들지 말고 하단 이미지로 처리하세요.',
    ].join('\n');
  }
  if (status === 'exists') {
    return [
      kcNumber ? `KC 인증번호: ${kcNumber}` : 'KC 인증번호: 있음',
      '안전표시/KC/바코드 이미지가 있으면 제품정보 표와 중복하지 마세요.',
      kcNumber
        ? '안전표시/KC/바코드 이미지가 없을 때 제품정보 표에 KC 인증번호 항목을 추가하세요.'
        : '이미지나 원문에서 번호가 확인될 때만 제품정보 표에 KC 인증번호 항목을 추가하세요.',
    ].join('\n');
  }
  return [
    'KC 인증번호: AI가 원본 설명과 이미지로 판단',
    '안전표시/KC/바코드 이미지가 있으면 제품정보 표와 중복하지 마세요.',
  ].join('\n');
}

export function normalizeKcCertificationNumber(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

export function buildBoxSetInstruction(status: BoxSetStatus, quantity: string): string {
  const count = formatBoxSetQuantity(quantity);
  if (status === 'none') {
    return [
      '박스/세트 정보: 없음',
      '박스/세트 구분: 없음',
      '박스 또는 세트 포장 근거가 없으므로 1박스/세트 구성 문구와 패키지 섹션을 생성하지 마세요.',
    ].join('\n');
  }
  if (status === 'box' || status === 'exists') {
    return [
      '박스/세트 정보: 있음',
      '박스/세트 구분: 박스',
      count ? `1박스 수량: ${count}개입` : '',
      '업로드 이미지에서 박스 또는 패키지 구성 이미지가 확인되면 패키지 섹션을 만들고, 없으면 텍스트만으로 상품 이미지를 생성하지 마세요.',
      'packageLabel은 박스일 때 "1박스 N개입 구성" 또는 "박스 구성"처럼 쓰고 세트라고 부르지 마세요.',
    ].filter(Boolean).join('\n');
  }
  if (status === 'set') {
    return [
      '박스/세트 정보: 있음',
      '박스/세트 구분: 세트',
      count ? `세트 수량: ${count}개 구성` : '',
      '업로드 이미지에서 세트 구성품 이미지가 확인되면 패키지 섹션을 만들고, 없으면 텍스트만으로 상품 이미지를 생성하지 마세요.',
      'packageLabel은 세트일 때 "N개 세트 구성" 또는 "세트 구성"처럼 쓰고 1박스라고 부르지 마세요.',
    ].join('\n');
  }
  return [
    '박스/세트 정보: AI가 업로드 이미지와 원본 설명으로 판단',
    '박스/세트 구분: AI 판단',
    '박스가 보이면 박스, 여러 구성품 묶음만 보이면 세트로 구분하세요.',
    '박스/세트 포장 또는 구성 수량 근거가 보일 때만 1박스/세트 구성 섹션을 만들고, 근거가 없으면 생성하지 마세요.',
  ].join('\n');
}

export function buildColorVariantInstruction(
  status: ColorVariantStatus,
  colorNames: string,
): string {
  const names = formatColorVariantNames(colorNames);
  if (status === 'single') {
    return [
      names ? `색상 구성: 단일 색상 (${names})` : '색상 구성: 단일 색상',
      '색상 안내 섹션은 단일 색상 기준으로 만들고, 이미지에 없는 다른 색상을 상상해서 추가하지 마세요.',
    ].join('\n');
  }
  if (status === 'none') {
    return [
      '색상 구성: 없음',
      '색상 안내 섹션을 만들지 말고 color.subtitle는 빈 문자열, color.imageIndices는 빈 배열로 두세요.',
    ].join('\n');
  }
  if (status === 'multiple') {
    return [
      names ? `색상 구성: 여러 색상 (${names})` : '색상 구성: 여러 색상',
      '색상별 단독 상품 이미지가 각각 있으면 각각 배치하고, 한 이미지에 색상이 모여 있으면 그 비교컷 1장만 사용하세요.',
      '박스/배경/KC 라벨 색은 색상으로 세지 말고 실제 상품 본체 색상만 기준으로 판단하세요.',
    ].join('\n');
  }
  return [
    '색상 구성: AI가 업로드 이미지로 판단',
    names ? `색상명 힌트: ${names}` : '',
    '실제 상품 이미지에서 여러 색상이 확인될 때만 여러 색상으로 만들고, 단일 색상이면 단일 색상으로 표시하세요.',
    '색상별 단독컷이 없고 합쳐진 이미지뿐이면 색상 안내 이미지는 1장만 사용하세요.',
  ].filter(Boolean).join('\n');
}

function formatBoxSetQuantity(quantity: string): string {
  const trimmed = quantity.trim();
  if (!trimmed) return '';
  const numberOnly = trimmed.match(/\d+/)?.[0];
  return numberOnly || trimmed.replace(/\s+/g, ' ');
}

function formatColorVariantNames(colorNames: string): string {
  return colorNames
    .split(/[\n,，/]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' / ');
}
