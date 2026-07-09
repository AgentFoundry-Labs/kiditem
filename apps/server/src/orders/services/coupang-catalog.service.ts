import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 쿠팡 로켓 supplier 등록 상품 카탈로그 + KidItem 매칭.
 *
 * 확장(collectCoupangProducts)이 수집한 상품을 CoupangProductListing 에 upsert 하고,
 * 상품명을 정규화(브랜드/수량/무게/가격 제거 → **코어**)해서 셀피아 재고 아이템 이름과 매칭.
 * ⭐쿠팡=브랜드 접두("KY I&D"), 셀피아=가격 접두("4000...") 로 접두가 달라서, 코어만 비교해야 잡힌다.
 * 가격만 다른 상품(2000 vs 2500) 오매칭은 coupangNamePrice 로 뽑은 앞자리 가격을 가드로 거른다.
 *
 * 로켓 발주확정과 같은 flat 라인: 채널·인벤토리·상품 테이블을 직접 읽는다(rocket-po-confirm 과 동일 패턴).
 */

export interface CoupangProductInput {
  skuId: string;
  barcode?: string | null;
  vendorItemId?: string | null;
  productName: string;
  category?: string | null;
  state?: string | null;
}

export interface CoupangListingRow {
  id: string;
  skuId: string;
  barcode: string | null;
  productName: string;
  packQty: number | null;
  category: string | null;
  state: string | null;
  matchStatus: string;
  matchedOptionId: string | null;
  bundleOptionId: string | null;
  matchedOption: {
    id: string;
    name: string;
    barcode: string | null;
    availableStock: number;
  } | null;
}

type SellpiaMatch = { core: string; price: string | null; optionId: string };

const CONNECTED_STATUSES = new Set(['bundled', 'linked', 'ignored']);

/**
 * 상품명 → 코어 이름. 브랜드("KY I&D")·패키징(Pack_/Box_)·수량("N개입")·무게("Ng")·
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

/** 상품명에서 입수량(N개입/N개) 파싱. 묶음(2 이상)만, 아니면 null. */
export function parsePackQty(name: string): number | null {
  const m = String(name ?? '').match(/(\d+)\s*개입/) ?? String(name ?? '').match(/(\d+)\s*개(?!월)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 2 && n <= 999 ? n : null;
}

@Injectable()
export class CoupangCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** 확장 수집 상품 upsert + 셀피아 코어 이름매칭. 이미 연결된 행은 매칭상태 보존. */
  async syncListings(
    products: CoupangProductInput[],
    organizationId: string,
  ): Promise<{ total: number; matched: number; bundleCandidates: number; added: number }> {
    if (!Array.isArray(products) || products.length === 0) {
      throw new BadRequestException('동기화할 쿠팡 상품이 없습니다.');
    }

    const index = await this.sellpiaIndex(organizationId);
    const existing = await this.prisma.coupangProductListing.findMany({
      where: { organizationId },
      select: { skuId: true, matchStatus: true },
    });
    const prevStatusBySku = new Map(existing.map((e) => [e.skuId, e.matchStatus]));

    const now = new Date();
    let matched = 0;
    let bundleCandidates = 0;

    for (const p of products) {
      const skuId = String(p.skuId ?? '').trim();
      if (!skuId) continue;
      const normalizedName = normalizeCoupangName(p.productName);
      const packQty = parsePackQty(p.productName);
      if (packQty) bundleCandidates++;
      const m = this.matchOption(normalizedName, coupangNamePrice(p.productName), index);
      const matchedOptionId = m?.optionId ?? null;
      if (matchedOptionId) matched++;
      const matchStatus = matchedOptionId ? (m!.fuzzy ? 'fuzzy' : 'suggested') : 'unmatched';

      const productFields = {
        barcode: cleanNull(p.barcode),
        vendorItemId: cleanNull(p.vendorItemId),
        productName: p.productName,
        normalizedName,
        packQty,
        category: cleanNull(p.category),
        state: cleanNull(p.state),
        syncedAt: now,
      };
      const connected = CONNECTED_STATUSES.has(prevStatusBySku.get(skuId) ?? '');
      const matchFields = connected ? {} : { matchedOptionId, matchStatus };

      await this.prisma.coupangProductListing.upsert({
        where: { organizationId_skuId: { organizationId, skuId } },
        create: {
          organizationId,
          skuId,
          ...productFields,
          matchedOptionId,
          matchStatus,
        },
        update: { ...productFields, ...matchFields },
      });
    }

    const { added } = await this.backfillFromPurchaseOrders(organizationId, index);
    return { total: products.length, matched, bundleCandidates, added };
  }

  /**
   * 실제 발주(RocketPurchaseOrder) 바코드 중 카탈로그에 없는 것을 카탈로그로 보충한다.
   *
   * vendorSearch(QVT 소싱/검수 파이프라인)는 검수완료(INSPECTION_COMPLETE) 상품만 반환하므로,
   * 그 흐름 밖에서 등록된 기존/묶음 상품은 수집에서 빠진다. 반면 발주 데이터는 쿠팡이 실제
   * 주문하는 전체 바코드라, 여기서 빠진 바코드를 끌어와 이름매칭까지 해준다. 봇탐지 위험 없음.
   * skuId 는 출처 표시용 `po:<barcode>` 합성키(재실행 시 중복 생성 방지).
   */
  async backfillFromPurchaseOrders(
    organizationId: string,
    index?: SellpiaMatch[],
  ): Promise<{ added: number }> {
    const idx = index ?? (await this.sellpiaIndex(organizationId));
    const orders = await this.prisma.rocketPurchaseOrder.findMany({
      where: { organizationId },
      select: { items: true },
    });
    // 발주 items(JSON) → 바코드별 대표 상품명(가장 긴 이름 = 정보량 많음).
    const nameByBarcode = new Map<string, string>();
    for (const o of orders) {
      const items = Array.isArray(o.items) ? (o.items as Array<{ barcode?: unknown; name?: unknown }>) : [];
      for (const it of items) {
        const barcode = String(it?.barcode ?? '').trim();
        if (!barcode) continue;
        const name = String(it?.name ?? '').trim();
        const prev = nameByBarcode.get(barcode);
        if (!prev || name.length > prev.length) nameByBarcode.set(barcode, name);
      }
    }
    if (nameByBarcode.size === 0) return { added: 0 };

    // 이미 카탈로그에 있는 바코드는 건너뛴다(vendorSearch 로 이미 잡힌 것).
    const existing = await this.prisma.coupangProductListing.findMany({
      where: { organizationId, barcode: { in: [...nameByBarcode.keys()] } },
      select: { barcode: true },
    });
    const have = new Set(existing.map((e) => e.barcode));

    let added = 0;
    for (const [barcode, productName] of nameByBarcode) {
      if (have.has(barcode)) continue;
      const normalizedName = normalizeCoupangName(productName);
      const m = this.matchOption(normalizedName, coupangNamePrice(productName), idx);
      const matchedOptionId = m?.optionId ?? null;
      const matchStatus = matchedOptionId ? (m!.fuzzy ? 'fuzzy' : 'suggested') : 'unmatched';
      await this.prisma.coupangProductListing.upsert({
        where: { organizationId_skuId: { organizationId, skuId: `po:${barcode}` } },
        create: {
          organizationId,
          skuId: `po:${barcode}`,
          barcode,
          productName,
          normalizedName,
          packQty: parsePackQty(productName),
          matchedOptionId,
          matchStatus,
          syncedAt: new Date(),
        },
        update: {}, // 이미 있으면(재실행) 건드리지 않는다.
      });
      added++;
    }
    return { added };
  }

  /**
   * 발주 바코드 보충 + 저장된 카탈로그 재매칭 (셀피아 최신분·정규화 규칙 변경 반영).
   * 연결(bundled/linked/ignored)된 행은 건드리지 않는다. 쿠팡 재수집 없음(봇탐지 위험 없음).
   */
  async rematchListings(
    organizationId: string,
  ): Promise<{ total: number; matched: number; added: number }> {
    const index = await this.sellpiaIndex(organizationId);
    const { added } = await this.backfillFromPurchaseOrders(organizationId, index);
    const rows = await this.prisma.coupangProductListing.findMany({
      where: { organizationId, matchStatus: { in: ['unmatched', 'suggested', 'fuzzy'] } },
      select: { id: true, productName: true },
    });
    let matched = 0;
    for (const r of rows) {
      const core = normalizeCoupangName(r.productName);
      const m = this.matchOption(core, coupangNamePrice(r.productName), index);
      const optId = m?.optionId ?? null;
      if (optId) matched++;
      await this.prisma.coupangProductListing.updateMany({
        where: { id: r.id, organizationId },
        data: {
          normalizedName: core,
          matchedOptionId: optId,
          matchStatus: optId ? (m!.fuzzy ? 'fuzzy' : 'suggested') : 'unmatched',
        },
      });
    }
    return { total: rows.length, matched, added };
  }

  /** 카탈로그 목록 + 매칭된 단품(이름·바코드·가용재고) 조인. */
  async listListings(
    organizationId: string,
    opts: { onlyBundles?: boolean; onlyUnconnected?: boolean } = {},
  ): Promise<CoupangListingRow[]> {
    const rows = await this.prisma.coupangProductListing.findMany({
      where: {
        organizationId,
        ...(opts.onlyBundles ? { packQty: { not: null } } : {}),
        ...(opts.onlyUnconnected ? { matchStatus: { in: ['unmatched', 'suggested', 'fuzzy'] } } : {}),
      },
      orderBy: [{ matchStatus: 'asc' }, { productName: 'asc' }],
      take: 5000,
    });

    const optionIds = [
      ...new Set(rows.map((r) => r.matchedOptionId).filter((v): v is string => Boolean(v))),
    ];
    const options = optionIds.length
      ? await this.prisma.productOption.findMany({
          where: { id: { in: optionIds }, organizationId },
          select: {
            id: true,
            optionName: true,
            barcode: true,
            isBundle: true,
            availableStock: true,
            master: { select: { name: true } },
            inventory: { select: { currentStock: true, reservedStock: true } },
          },
        })
      : [];
    const optMap = new Map(options.map((o) => [o.id, o]));

    return rows.map((r) => {
      const o = r.matchedOptionId ? optMap.get(r.matchedOptionId) : undefined;
      return {
        id: r.id,
        skuId: r.skuId,
        barcode: r.barcode,
        productName: r.productName,
        packQty: r.packQty,
        category: r.category,
        state: r.state,
        matchStatus: r.matchStatus,
        matchedOptionId: r.matchedOptionId,
        bundleOptionId: r.bundleOptionId,
        matchedOption: o
          ? {
              id: o.id,
              name: `${o.master?.name ?? ''} ${o.optionName ?? ''}`.trim() || (o.optionName ?? ''),
              barcode: o.barcode,
              availableStock: o.isBundle
                ? Math.max(0, o.availableStock ?? 0)
                : Math.max(0, (o.inventory?.currentStock ?? 0) - (o.inventory?.reservedStock ?? 0)),
            }
          : null,
      };
    });
  }

  /** 사용자 확인/연결 결과 반영 (매칭 단품 수정 · 연결완료 상태 · 무시). */
  async updateListing(
    organizationId: string,
    id: string,
    patch: { matchedOptionId?: string | null; matchStatus?: string; bundleOptionId?: string | null },
  ): Promise<void> {
    const data: Record<string, unknown> = {};
    if ('matchedOptionId' in patch) data.matchedOptionId = patch.matchedOptionId ?? null;
    if ('bundleOptionId' in patch) data.bundleOptionId = patch.bundleOptionId ?? null;
    if (patch.matchStatus) {
      if (!['unmatched', 'suggested', 'fuzzy', 'linked', 'bundled', 'ignored'].includes(patch.matchStatus)) {
        throw new BadRequestException('잘못된 matchStatus');
      }
      data.matchStatus = patch.matchStatus;
    }
    if (Object.keys(data).length === 0) return;
    const updated = await this.prisma.coupangProductListing.updateMany({
      where: { id, organizationId },
      data,
    });
    if (updated.count === 0) throw new NotFoundException('쿠팡 상품을 찾을 수 없습니다.');
  }

  /** 셀피아 최신 스냅샷 아이템 → {코어, 가격, 옵션id} (매칭 소스). productOptionId 있는 것만. */
  private async sellpiaIndex(organizationId: string): Promise<SellpiaMatch[]> {
    const snapshot = await this.prisma.sellpiaStockSnapshot.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!snapshot) return [];
    const items = await this.prisma.sellpiaStockSnapshotItem.findMany({
      where: { organizationId, snapshotId: snapshot.id, productOptionId: { not: null } },
      select: { sellpiaProductName: true, productOptionId: true },
    });
    const seen = new Set<string>();
    const out: SellpiaMatch[] = [];
    for (const s of items) {
      const core = normalizeCoupangName(s.sellpiaProductName ?? '');
      if (core.length < 2 || !s.productOptionId) continue;
      const price = coupangNamePrice(s.sellpiaProductName ?? '');
      // ⭐코어가 같아도 가격이 다르면 다른 상품(1000 vs 2000 통통지구본소프트볼) — 가격까지 dedup 키에 넣어야
      // 가격 가드와 안 싸운다. core 만으로 dedup 하면 엉뚱한 가격 트윈만 남아 정답이 미매칭된다.
      const key = `${core}|${price ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ core, price, optionId: s.productOptionId });
    }
    return out;
  }

  /**
   * 코어 매칭: 완전일치 → 포함 → 퍼지(LCS) + 가격 가드.
   * fuzzy=true 는 이름이 갈렸지만 핵심이 크게 겹치는 후보 — 오매칭 가능성이 있어 확인이 더 필요.
   */
  private matchOption(
    core: string,
    price: string | null,
    index: SellpiaMatch[],
  ): { optionId: string; fuzzy: boolean } | null {
    if (core.length < 2) return null;
    const compatible = (s: SellpiaMatch) => !(price && s.price && price !== s.price);
    const exact = index.find((s) => s.core === core && compatible(s));
    if (exact) return { optionId: exact.optionId, fuzzy: false };
    if (core.length < 3) return null;
    const contained = index.find(
      (s) => s.core.length >= 3 && compatible(s) && (core.includes(s.core) || s.core.includes(core)),
    );
    if (contained) return { optionId: contained.optionId, fuzzy: false };
    // 퍼지: 두 신호 중 하나라도 통과하면 후보(확인 필요).
    //  - 연속 LCS: 접두/접미가 크게 겹침("길이조절"↔"길어져랏 …잠자리채").
    //  - Dice bigram: 중간 단어만 치환된 경우("유니콘물게임기"↔"유니콘워터게임기", 물=워터).
    if (core.length < 4) return null;
    let best: SellpiaMatch | null = null;
    let bestScore = 0;
    for (const s of index) {
      if (!compatible(s) || s.core.length < 4) continue;
      const minLen = Math.min(core.length, s.core.length);
      const lcs = lcsLength(core, s.core);
      const { dice, shared } = diceBigram(core, s.core);
      const lcsOk = lcs >= 6 && lcs >= 0.45 * minLen;
      const diceOk = dice >= 0.5 && shared >= 3;
      if (!lcsOk && !diceOk) continue;
      // 두 신호를 같은 스케일로 비교(LCS는 minLen 대비 비율) → 강한 쪽으로 최적 후보 선택.
      const score = Math.max(dice, lcs / minLen);
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best ? { optionId: best.optionId, fuzzy: true } : null;
  }
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

function cleanNull(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}
