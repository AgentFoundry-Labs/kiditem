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
const FILE_NAME_DATE_PATTERNS = [
  /((?:20)?\d{2})[-_.년\s]?(\d{1,2})[-_.월\s]?(\d{1,2})/u,
  /(\d{4})(\d{2})(\d{2})/u,
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
  const byDate = new Map<string, CoupangShipmentFileDraft[]>();
  for (const draft of drafts) {
    if (!draft.file.type.includes('pdf') && !draft.name.toLowerCase().endsWith('.pdf')) {
      throw new Error(`${draft.name} 파일은 PDF가 아닙니다.`);
    }
    const list = byDate.get(draft.shipmentDate) ?? [];
    list.push(draft);
    byDate.set(draft.shipmentDate, list);
  }

  const results: CoupangShipmentMergeResult[] = [];
  for (const [date, dateItems] of [...byDate.entries()].sort(([a], [b]) => b.localeCompare(a))) {
    const files: CoupangShipmentMergedFile[] = [];
    for (const kind of ['label', 'statement'] as const) {
      const items = sortCoupangShipmentFiles(dateItems.filter((item) => item.kind === kind));
      if (items.length === 0) continue;
      files.push(await mergePdfKind(date, kind, items));
    }
    if (files.length > 0) results.push({ date, files });
  }
  return results;
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
    const match = name.match(pattern);
    if (!match) continue;
    const rawYear = match[1];
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    const month = String(Number(match[2])).padStart(2, '0');
    const day = String(Number(match[3])).padStart(2, '0');
    if (!year || month === 'NaN' || day === 'NaN') continue;
    return `${year}-${month}-${day}`;
  }
  return null;
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
