const STATIONERY_TOY_TERMS = [
  '문구', '학용품', '필통', '스티커', '다꾸', '마스킹테이프', '색연필', '사인펜', '볼펜',
  '지우개', '연필', '크레파스', '크레용', '스케치북', '공책', '메모지', '포스트잇',
  '다이어리', '키링', '키홀더', '포토카드', '색칠공부', '종이접기', '공예키트',
  '만들기키트', '비즈', '클레이', '점토', '데코덴', '완구', '장난감', '봉제인형',
  '인형', '피규어', '미니어처', '블록', '레고', '퍼즐', '보드게임', '카드게임',
  '스퀴시', '슬라임', '말랑이', '팝잇', '스트레스볼', '촉감놀이', '역할놀이',
  '소꿉놀이', '주방놀이', '병원놀이', '물총', '버블건', '블라인드박스',
] as const;

const LICENSED_TOY_TERMS = [
  '포켓몬', '산리오', '티니핑', '터닝메카드', '헬로카봇', '뽀로로', '타요',
  '브레드이발소', '시크릿쥬쥬', '또봇', '레고', '디즈니', '마블', '짱구', '쿠로미',
  '마이멜로디',
] as const;

const FALSE_POSITIVES = ['노트북', '블록체인', '인형뽑기방', '장난감도서관'] as const;

/** 네이버 관련어 중 실제 문구·완구 상품 탐색 범위에 속하는 키워드만 남긴다. */
export function isStationeryToyKeyword(keyword: string): boolean {
  const normalized = compact(keyword);
  if (!normalized || FALSE_POSITIVES.some((term) => normalized.includes(compact(term)))) return false;
  return [...STATIONERY_TOY_TERMS, ...LICENSED_TOY_TERMS]
    .some((term) => normalized.includes(compact(term)));
}

function compact(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[^a-z0-9가-힣]+/gi, '');
}
