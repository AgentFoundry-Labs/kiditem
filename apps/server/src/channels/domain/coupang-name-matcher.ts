/**
 * 쿠팡 상품명 ↔ 셀피아 상품명 이름 매칭(순수). 바코드로 못 찾은 상품을 이름으로 보조 매칭한다.
 * 파이프라인: 정규화(코어) → 완전일치 → 포함 → 퍼지(LCS + Dice bigram) + 가격가드.
 * (사용자 원본 로직을 codex 도메인으로 이식 — orders-owned 서비스/테이블과 무관한 순수 함수라 충돌 없음.)
 */

/** 이름 매칭 인덱스 항목: 셀피아 상품명 → 코어/가격/재고/SKU id. */
export type NameMatchEntry = {
  core: string;
  price: string | null;
  stock: number;
  name: string;
  skuId: string;
};

/**
 * 쿠팡 로켓 상품명에서 "1발주 = 셀피아 몇 개(팩 크기)"를 뽑는다. 셀피아 재고는 낱개 기준,
 * 쿠팡은 "18개입"처럼 묶음 발주 → 가용 발주수량 = floor(낱개재고 / 팩크기). 없으면 1.
 */
export function parseCoupangPackSize(name: string): number {
  const text = String(name ?? '');
  const match = text.match(/(\d+)\s*개\s*입/) ?? text.match(/(\d+)\s*개(?!\s*월)/);
  const size = match ? Number.parseInt(match[1]!, 10) : 1;
  return Number.isFinite(size) && size > 0 ? size : 1;
}

/**
 * 상품명 → 코어 이름. 브랜드("KY I&D")·패키징(Pack_/Box_)·수량("N개입")·무게·
 * 노이즈(랜덤발송 등)·모든 숫자(앞자리 가격 포함)를 제거한다. 가격은 coupangNamePrice 로 별도 비교.
 */
export function normalizeCoupangName(name: string): string {
  return String(name ?? '')
    .replace(/KY\s*I\s*&?\s*D/gi, ' ') // 브랜드
    .replace(/\b(?:pack|box|set)[_\s]/gi, ' ') // 패키징 접두
    .replace(/\(?\s*\d+\s*개입?\s*\)?/g, ' ') // 수량 "(16개입)", "12개"
    .replace(/\d+\s*세트/g, ' ')
    .replace(/\d+\s*입/g, ' ')
    .replace(/\d+\s*(?:g|kg|ml|cm|mm|호)\b/gi, ' ') // 무게/규격
    .replace(/랜덤발송|혼합색상|색상랜덤|랜덤|쿠팡용|외\s*\d+\s*종/g, ' ')
    .replace(/\d+/g, ' ') // 남은 숫자(가격 포함) 제거 — 코어만
    .replace(/[^가-힣a-zA-Z]/g, '')
    .toLowerCase();
}

/** 상품명 앞 가격(3~6자리, 브랜드접두 뒤) 추출 — 가격만 다른 상품 오매칭 가드용. */
export function coupangNamePrice(name: string): string | null {
  const t = String(name ?? '')
    .replace(/KY\s*I\s*&?\s*D/gi, '')
    .replace(/\b(?:pack|box|set)[_\s]/gi, '')
    .trim();
  const m = t.match(/^(\d{3,6})/);
  return m ? m[1] : null;
}

/** 글자 bigram Dice 유사도(0~1) + 공통 bigram 수. 중간 단어 치환/어순차에 강한 퍼지 신호. */
export function diceBigram(a: string, b: string): { dice: number; shared: number } {
  if (a.length < 2 || b.length < 2) return { dice: 0, shared: 0 };
  const setA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) setA.add(a.slice(i, i + 2));
  const setB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) setB.add(b.slice(i, i + 2));
  let shared = 0;
  for (const g of setA) if (setB.has(g)) shared++;
  return { dice: (2 * shared) / (setA.size + setB.size), shared };
}

/** 두 문자열의 공통 최장 연속부분문자열 길이 (퍼지 이름매칭용). */
export function lcsLength(a: string, b: string): number {
  const n = b.length;
  let max = 0;
  const dp = new Array(n + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : 0;
      if (dp[j] > max) max = dp[j];
      prev = tmp;
    }
  }
  return max;
}

/**
 * 이름 매칭 인덱스(전수 스캔 회피용). 완전일치는 코어 Map(O(1)), 퍼지는 bigram 버킷으로
 * 코어를 공유하는 후보만 비교한다. byBigram 값은 `all` 배열의 인덱스라 원래 순서가 보존된다.
 */
export type NameMatchIndex = {
  all: NameMatchEntry[];
  byCore: Map<string, NameMatchEntry[]>;
  byBigram: Map<string, number[]>;
};

/** NameMatchEntry 목록 → 매칭 인덱스. 매칭 전 한 번만 만든다. */
export function buildNameMatchIndex(entries: NameMatchEntry[]): NameMatchIndex {
  const byCore = new Map<string, NameMatchEntry[]>();
  const byBigram = new Map<string, number[]>();
  entries.forEach((entry, i) => {
    if (entry.core.length < 2) return;
    const coreBucket = byCore.get(entry.core);
    if (coreBucket) coreBucket.push(entry);
    else byCore.set(entry.core, [entry]);
    const seen = new Set<string>();
    for (let k = 0; k < entry.core.length - 1; k++) {
      const g = entry.core.slice(k, k + 2);
      if (seen.has(g)) continue;
      seen.add(g);
      const bucket = byBigram.get(g);
      if (bucket) bucket.push(i);
      else byBigram.set(g, [i]);
    }
  });
  return { all: entries, byCore, byBigram };
}

/**
 * 코어 매칭: 완전일치 → 포함 → 퍼지(LCS/Dice) + 가격 가드. 매칭된 셀피아 항목을 반환.
 * fuzzy=true 는 이름이 갈렸지만 핵심이 크게 겹치는 후보 — 오매칭 가능성이 있어 확인이 더 필요.
 * 결과는 전수 스캔과 동일하다(퍼지 후보 집합은 원래 후보의 상위집합을 원래 순서로 처리).
 */
export function matchCoupangProductByName(
  core: string,
  price: string | null,
  index: NameMatchIndex,
): { stock: number; fuzzy: boolean; name: string; skuId: string } | null {
  if (core.length < 2) return null;
  const compatible = (s: NameMatchEntry) => !(price && s.price && price !== s.price);
  const exact = index.byCore.get(core)?.find(compatible);
  if (exact) return { stock: exact.stock, fuzzy: false, name: exact.name, skuId: exact.skuId };
  if (core.length < 3) return null;
  const contained = index.all.find(
    (s) => s.core.length >= 3 && compatible(s) && (core.includes(s.core) || s.core.includes(core)),
  );
  if (contained) return { stock: contained.stock, fuzzy: false, name: contained.name, skuId: contained.skuId };
  // 퍼지: 쿼리 코어와 bigram 을 하나라도 공유하는 후보만 비교(전수 스캔 회피).
  if (core.length < 4) return null;
  const candidateIdx = new Set<number>();
  const seenBigrams = new Set<string>();
  for (let k = 0; k < core.length - 1; k++) {
    const g = core.slice(k, k + 2);
    if (seenBigrams.has(g)) continue;
    seenBigrams.add(g);
    const bucket = index.byBigram.get(g);
    if (bucket) for (const i of bucket) candidateIdx.add(i);
  }
  let best: NameMatchEntry | null = null;
  let bestScore = 0;
  for (const i of [...candidateIdx].sort((a, b) => a - b)) {
    const s = index.all[i]!;
    if (!compatible(s) || s.core.length < 4) continue;
    const minLen = Math.min(core.length, s.core.length);
    const lcs = lcsLength(core, s.core);
    const { dice, shared } = diceBigram(core, s.core);
    const lcsOk = lcs >= 6 && lcs >= 0.45 * minLen;
    const diceOk = dice >= 0.5 && shared >= 3;
    if (!lcsOk && !diceOk) continue;
    const score = Math.max(dice, lcs / minLen);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best ? { stock: best.stock, fuzzy: true, name: best.name, skuId: best.skuId } : null;
}
