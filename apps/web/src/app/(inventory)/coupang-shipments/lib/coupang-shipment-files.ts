'use client';

export type CoupangShipmentFileKind = 'label' | 'statement';

export interface CoupangShipmentFileDraft {
  id: string;
  file: File;
  name: string;
  kind: CoupangShipmentFileKind;
  shipmentDate: string;
  center: string;
}

export interface CoupangShipmentMergedFile {
  id: string;
  kind: CoupangShipmentFileKind;
  shipmentDate: string;
  centers: string[];
  sourceCount: number;
  pageCount: number;
  fileName: string;
  blob: Blob;
  createdAt: number;
}

export interface CoupangShipmentMergeResult {
  date: string;
  files: CoupangShipmentMergedFile[];
}

export const COUPANG_SHIPMENT_PAGE_URL = 'https://supplier.coupang.com/ibs/asn/active';

export const COUPANG_SHIPMENT_CENTERS = [
  '서울',
  '인천',
  '동탄',
  '천안',
  '대구',
  '창원',
  '부산',
  '광주',
  '대전',
  '김해',
  '양산',
  '고양',
  '파주',
  '김포',
  '안산',
  '용인',
  '평택',
  '안성',
  '여주',
  '이천',
  '칠곡',
  '미분류',
] as const;

const CENTER_RANK: Map<string, number> = new Map(COUPANG_SHIPMENT_CENTERS.map((center, index) => [center, index]));
// 파일명에서 날짜 추출. (?<!\d)/(?!\d) 로 숫자 경계를 강제해 쉽먼트 번호 같은 긴 숫자열의 일부를
// 날짜로 오인하지 않게 한다(같은 날 파일이 가짜 날짜로 흩어져 종류별 병합이 여러 개로 쪼개지던 버그 방지).
const FILE_NAME_DATE_PATTERNS = [
  // 4자리 연도(20xx) + 선택적 구분자: 2026-06-30 / 2026.6.30 / 20260630
  /(?<!\d)(20\d{2})[-_.년\s]?\s?(\d{1,2})[-_.월\s]?\s?(\d{1,2})(?!\d)/u,
  // 2자리 연도 + 구분자 필수: 26-06-30 / 26.6.30
  /(?<!\d)(\d{2})[-_.년](\d{1,2})[-_.월]?(\d{1,2})(?!\d)/u,
  // 구분자 없는 6자리 YYMMDD: 260630
  /(?<!\d)(\d{2})(\d{2})(\d{2})(?!\d)/u,
];

export function classifyCoupangShipmentFile(file: File, fallbackDate = todayKey()): CoupangShipmentFileDraft {
  const normalized = file.name.normalize('NFC');
  return {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    file,
    name: normalized,
    kind: detectFileKind(normalized),
    shipmentDate: detectDate(normalized) ?? fallbackDate,
    center: detectCenter(normalized),
  };
}

export function sortCoupangShipmentFiles<T extends Pick<CoupangShipmentFileDraft, 'shipmentDate' | 'kind' | 'center' | 'name'>>(
  files: T[],
): T[] {
  return [...files].sort((a, b) => {
    const date = a.shipmentDate.localeCompare(b.shipmentDate);
    if (date !== 0) return date;
    const kind = kindRank(a.kind) - kindRank(b.kind);
    if (kind !== 0) return kind;
    const center = compareCenters(a.center, b.center);
    if (center !== 0) return center;
    return a.name.localeCompare(b.name, 'ko');
  });
}

export async function mergeCoupangShipmentFiles(
  drafts: CoupangShipmentFileDraft[],
): Promise<CoupangShipmentMergeResult[]> {
  for (const draft of drafts) {
    if (!draft.file.type.includes('pdf') && !draft.name.toLowerCase().endsWith('.pdf')) {
      throw new Error(`${draft.name} 파일은 PDF가 아닙니다.`);
    }
  }

  // 종류(라벨/내역서)별로만 통합한다 — 날짜로는 쪼개지 않는다. 라벨 전부 1개 + 내역서 전부 1개.
  // (개별 파일의 날짜가 달라도 하나로 합쳐지도록. 배치는 대표 날짜 하나로 묶어 표시)
  const batchDate = representativeDate(drafts);
  const files: CoupangShipmentMergedFile[] = [];
  for (const kind of ['label', 'statement'] as const) {
    const items = sortCoupangShipmentFiles(drafts.filter((item) => item.kind === kind));
    if (items.length === 0) continue;
    files.push(await mergePdfKind(batchDate, kind, items));
  }
  return files.length > 0 ? [{ date: batchDate, files }] : [];
}

// 배치를 대표할 날짜: 가장 많이 등장한 shipmentDate(동률이면 최신). 보통 한 배치는 같은 날이다.
function representativeDate(drafts: CoupangShipmentFileDraft[]): string {
  const counts = new Map<string, number>();
  for (const draft of drafts) {
    counts.set(draft.shipmentDate, (counts.get(draft.shipmentDate) ?? 0) + 1);
  }
  let bestDate = todayKey();
  let bestCount = 0;
  for (const [date, count] of counts) {
    if (count > bestCount || (count === bestCount && date.localeCompare(bestDate) > 0)) {
      bestDate = date;
      bestCount = count;
    }
  }
  return bestDate;
}

export function displayKind(kind: CoupangShipmentFileKind): string {
  return kind === 'label' ? 'Label' : '내역서';
}

export function todayKey(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export function compareCenters(a: string, b: string): number {
  const left = splitCenter(a);
  const right = splitCenter(b);
  const rank = (CENTER_RANK.get(left.base) ?? 999) - (CENTER_RANK.get(right.base) ?? 999);
  if (rank !== 0) return rank;
  if (left.number !== right.number) return left.number - right.number;
  return a.localeCompare(b, 'ko');
}

function detectFileKind(name: string): CoupangShipmentFileKind {
  const lower = name.toLowerCase();
  if (name.includes('내역서') || name.includes('거래명세') || lower.includes('statement') || lower.includes('spec')) {
    return 'statement';
  }
  return 'label';
}

function detectDate(name: string): string | null {
  for (const pattern of FILE_NAME_DATE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(name)) !== null) {
      const rawYear = match[1];
      const year = rawYear.length === 2 ? Number(`20${rawYear}`) : Number(rawYear);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (isPlausibleYmd(year, month, day)) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

// 파일명 속 숫자(쉽먼트 번호·센터 번호)를 날짜로 오인하지 않도록 최근 연도 + 유효 월/일만 인정.
function isPlausibleYmd(year: number, month: number, day: number): boolean {
  const maxYear = new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < 2020 || year > maxYear) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  return true;
}

function detectCenter(name: string): string {
  for (const center of COUPANG_SHIPMENT_CENTERS) {
    if (center === '미분류') continue;
    const match = name.match(new RegExp(`${center}\\s*(\\d*)`, 'u'));
    if (match) return `${center}${match[1] ?? ''}`;
  }
  return '미분류';
}

function splitCenter(center: string): { base: string; number: number } {
  const match = center.match(/^([^\d]+)(\d+)?$/u);
  return {
    base: match?.[1] ?? center,
    number: match?.[2] ? Number(match[2]) : 0,
  };
}

function kindRank(kind: CoupangShipmentFileKind): number {
  return kind === 'label' ? 0 : 1;
}

async function mergePdfKind(
  date: string,
  kind: CoupangShipmentFileKind,
  items: CoupangShipmentFileDraft[],
): Promise<CoupangShipmentMergedFile> {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  const centers = uniqueSortedCenters(items.map((item) => item.center));
  let pageCount = 0;

  for (const item of items) {
    const src = await PDFDocument.load(await item.file.arrayBuffer());
    const copiedPages = await out.copyPages(src, src.getPageIndices());
    copiedPages.forEach((page) => {
      out.addPage(page);
      pageCount += 1;
    });
  }

  const bytes = await out.save();
  const pdfBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(pdfBuffer).set(bytes);
  const fileName = `쿠팡쉽먼트_${date}_${displayKind(kind)}_${centers.join('-')}.pdf`;
  return {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    kind,
    shipmentDate: date,
    centers,
    sourceCount: items.length,
    pageCount,
    fileName,
    blob: new Blob([pdfBuffer], { type: 'application/pdf' }),
    createdAt: Date.now(),
  };
}

function uniqueSortedCenters(centers: string[]): string[] {
  return [...new Set(centers)].sort(compareCenters);
}
