/** 목록 줄 세우기 — 기본은 최신 등록순(사장님 2026-09-21). */
export const SORT_OPTIONS = [
  { value: 'latest', label: '최신 등록순' },
  { value: 'revenue', label: '매출순' },
  { value: 'profit', label: '이익순' },
  { value: 'margin', label: '이익률순' },
  { value: 'sold', label: '판매수량순' },
  { value: 'stock', label: '재고순' },
] as const;

export const PERIOD_OPTIONS = [
  { days: 7, label: '7일' },
  { days: 14, label: '14일' },
  { days: 30, label: '30일' },
  { days: 365, label: '연간' },
] as const;

export const CATEGORY_TABS = [
  { key: 'all', label: '전체 카테고리' },
  { key: 'new', label: '신상품' },
  { key: 'season', label: '시즌상품' },
  { key: 'stationery', label: '문구/학용품' },
  { key: 'toy', label: '완구/놀이' },
  { key: 'bag', label: '팬시/가방/기타' },
  { key: 'music-art-sports', label: '교재/음악/체육' },
  { key: 'learning', label: '학습교재' },
  { key: 'fancy', label: '캐릭터상품' },
  { key: 'craft', label: '만들기/공예' },
  { key: 'kindergarten', label: '유치원용품' },
  { key: 'snack', label: '달란트' },
] as const;
