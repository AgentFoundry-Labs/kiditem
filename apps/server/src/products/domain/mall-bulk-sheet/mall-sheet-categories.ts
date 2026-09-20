/**
 * 몰 카테고리표 — 사방넷에서 옮긴 몰 카테고리 경로(글자)를 몰 엑셀이 받는 번호로 바꾼다.
 *
 * 표는 몰이 공개하거나 판매자센터가 보여 주는 목록에서 만든 자료다(저장소 어댑터가 읽는다). 경로는 몰이 쓰는 이름
 * 그대로라, `>` 앞뒤 띄어쓰기만 맞추면 그대로 찾는다. 못 찾으면 null — 비슷한 이름으로 짐작하지 않는다. 몰이 이름을
 * 바꾼 분류를 비슷한 분류에 넣으면 틀린 자리에 올라간다.
 */

export interface MallCategoryTables {
  /** 몰 키 → (정규화 경로 → 몰 카테고리 번호). */
  paths: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** ESM: G마켓 · 옥션 카테고리 번호 → ESM 카테고리 번호(우리 ESM 상품이 쓰는 짝). */
  esmBySite: Readonly<Record<string, string>>;
  /** 쿠팡: 카테고리 번호 → [경로, 구매옵션 칸…](`색상 [필수]`, `수량 [필수] [기본단위: 개]`). */
  coupang: Readonly<Record<string, readonly string[]>>;
}

export interface CoupangPurchaseOption {
  name: string;
  required: boolean;
  /** 단위형 옵션의 기본 단위(`개`, `g`, `ml`). 직접 입력형이면 null. */
  unit: string | null;
  /** `(택1)` 묶음 — 둘 중 하나만 채우면 된다. */
  pickOne: boolean;
}

export interface CoupangCategory {
  code: string;
  path: string;
  purchaseOptions: CoupangPurchaseOption[];
}

/**
 * `a > b > c` · `a>b>c` → `a>b>c`. 사방넷이 앞에 붙인 몰 묶음 이름(`도서/문구::…`)은 뗀다.
 */
export function categoryKey(path: string): string {
  const withoutGroup = path.includes('::') ? path.slice(path.lastIndexOf('::') + 2) : path;
  return withoutGroup.split('>').map((segment) => segment.trim()).filter(Boolean).join('>');
}

/** 쿠팡 카테고리표의 구매옵션 칸 글자(`수량 [필수] [기본단위: 개]`)를 뜻으로. */
export function parseCoupangPurchaseOption(raw: string): CoupangPurchaseOption | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const pickOne = text.startsWith('(택1)');
  const name = text.replace(/^\(택1\)\s*/, '').replace(/\s*\[.*$/, '').trim();
  if (!name) return null;
  const unit = /\[기본단위:\s*([^\]]+)\]/.exec(text)?.[1]?.trim() ?? null;
  return { name, required: /\[필수\]/.test(text), unit, pickOne };
}

export class MallCategoryLookup {
  private readonly byMall = new Map<string, Map<string, string>>();
  private readonly coupangByPath = new Map<string, string>();

  constructor(private readonly tables: MallCategoryTables) {
    for (const [mallKey, paths] of Object.entries(tables.paths)) {
      const map = new Map<string, string>();
      for (const [path, code] of Object.entries(paths)) map.set(categoryKey(path), code);
      this.byMall.set(mallKey, map);
    }
    for (const [code, [path]] of Object.entries(tables.coupang)) {
      if (path) this.coupangByPath.set(categoryKey(path), code);
    }
  }

  /** 몰 카테고리 경로 → 그 몰 번호. 모르면 null. */
  code(mallKey: string, path: string | null): string | null {
    if (!path?.trim()) return null;
    const key = categoryKey(path);
    if (mallKey === 'coupang') return this.coupangByPath.get(key) ?? null;
    return this.byMall.get(mallKey)?.get(key) ?? null;
  }

  /** 그 몰 분류표에서 글자가 든 경로를 찾는다(많이 짧은 것부터). 표가 없으면 빈 배열. */
  search(mallKey: string, query: string, limit: number): { paths: string[]; total: number } {
    const table = this.byMall.get(mallKey);
    if (!table) return { paths: [], total: 0 };
    const needle = query.trim().toLowerCase();
    const found: string[] = [];
    for (const path of table.keys()) {
      if (needle && !path.toLowerCase().includes(needle)) continue;
      found.push(path);
    }
    found.sort((left, right) => left.length - right.length || left.localeCompare(right));
    return { paths: found.slice(0, limit), total: table.size };
  }

  /** G마켓 · 옥션 카테고리 번호 → ESM 카테고리 번호. */
  esmCode(siteCode: string | null): string | null {
    return siteCode ? this.tables.esmBySite[siteCode] ?? null : null;
  }

  coupang(code: string | null): CoupangCategory | null {
    if (!code) return null;
    const entry = this.tables.coupang[code];
    if (!entry?.[0]) return null;
    const [path, ...options] = entry;
    return {
      code,
      path,
      purchaseOptions: options
        .map((option) => parseCoupangPurchaseOption(option))
        .filter((option): option is CoupangPurchaseOption => option !== null),
    };
  }
}
