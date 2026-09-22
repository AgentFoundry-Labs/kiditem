import { downloadBlob } from '@/lib/browser-download';
import type { OrderCollectionConversionResult } from './order-collection-api';

/**
 * Reading a Sellpia conversion response.
 *
 * Every mall's `convert*ToSellpiaFile` ended the same way: take the blob,
 * recover the server's filename or fall back to a Korean default, read a
 * preview off the workbook, and pull four row counts out of four headers. Twelve
 * modules each carried their own copy, and the copies had drifted.
 *
 * `numericHeader` was duplicated fourteen times — identical every time, only the
 * parameter names differed. The preview reader was duplicated twelve times and
 * differed in exactly one number, the column cap. The filename parser was worse:
 * seven modules had the same correct version and five had written their own
 * inline, which
 *
 *   - matched `filename*=UTF-8''` case-sensitively, though the header's casing
 *     is not the sender's to fix;
 *   - called `decodeURIComponent` unguarded, so one malformed percent-escape
 *     throws `URIError` out of a function whose job is to name a download; and
 *   - never looked at plain `filename="…"`, silently falling back to the
 *     hardcoded Korean default whenever the server sent the plain form.
 *
 * None of that was a decision any of those five malls made. It is what happens
 * when the same twenty lines are written twelve times.
 */

/** The four counts the converter reports back, one header each. */
const ROW_COUNT_HEADERS = {
  sourceRows: 'X-Order-Collection-Source-Rows',
  productRows: 'X-Order-Collection-Product-Rows',
  outputRows: 'X-Order-Collection-Output-Rows',
  skippedRows: 'X-Order-Collection-Skipped-Rows',
} as const;

/**
 * How to build the preview grid. A workbook keeps `xlsxColumns` columns — the
 * one value that genuinely differed between malls, because their output sheets
 * are different widths. Art09 alone converts to CSV.
 */
export type ConversionPreview =
  | { xlsxColumns: number }
  | { csv: true };

/** Rows kept in the preview grid, the same for every mall. */
const PREVIEW_ROW_LIMIT = 24;

/** 변환이 사람에게 남긴 말(표에 없어 비워 둔 칸 같은 것). 서버가 URL 인코딩한 JSON 배열로 보낸다. */
const NOTES_HEADER = 'X-Order-Collection-Notes';

function notesHeader(response: Response): string[] | undefined {
  const value = response.headers.get(NOTES_HEADER);
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (!Array.isArray(parsed)) return undefined;
    const notes = parsed.filter((item): item is string => typeof item === 'string');
    return notes.length > 0 ? notes : undefined;
  } catch {
    // 읽지 못한 말은 없는 것으로 둔다 — 변환 자체는 이미 성공했다.
    return undefined;
  }
}

function numericHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function fileNameFromContentDisposition(value: string | null): string | null {
  if (!value) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // A filename we cannot decode is still a better name than none, and
      // throwing here would fail a conversion that already succeeded.
      return encoded;
    }
  }
  return /filename="([^"]+)"/i.exec(value)?.[1] ?? null;
}

async function previewRowsOf(blob: Blob, preview: ConversionPreview): Promise<string[][]> {
  if ('csv' in preview) return parseCsvRows((await blob.text()).replace(/^\uFEFF/, ''), PREVIEW_ROW_LIMIT);
  // Imported here rather than at module scope: xlsx is large, and a page that
  // never converts a file should not carry it.
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null | undefined>>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  return rows
    .slice(0, PREVIEW_ROW_LIMIT)
    .map((row) => row.slice(0, preview.xlsxColumns).map((cell) => String(cell ?? '')));
}

/**
 * Quoted fields may contain commas, newlines, and `""` escapes.
 *
 * Moved verbatim from the Art09 module, which was the only mall converting to
 * CSV and so the only one that had needed it.
 */
function parseCsvRows(text: string, limit: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const pushRow = () => {
    if (row.length === 0 && cell.length === 0) return;
    row.push(cell);
    rows.push(row);
    row = [];
    cell = '';
  };

  for (let index = 0; index < text.length && rows.length < limit; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      pushRow();
    } else {
      cell += character;
    }
  }

  if (rows.length < limit && (row.length > 0 || cell.length > 0)) pushRow();
  return rows;
}

/**
 * Turn a successful conversion response into the result the page renders.
 *
 * The caller owns the request and its error handling — those differ per mall
 * (multipart for a collected workbook, JSON for collected rows) and are the
 * reason this starts at the response rather than the request.
 */
export async function conversionResultFrom(
  response: Response,
  options: {
    /** Used only when the server sent no usable `Content-Disposition`. */
    defaultFileName: string;
    preview: ConversionPreview;
    /** Defaults to downloading, which is what every caller but a test wants. */
    download?: boolean;
  },
): Promise<OrderCollectionConversionResult> {
  const blob = await response.blob();
  const fileName = fileNameFromContentDisposition(response.headers.get('Content-Disposition'))
    ?? options.defaultFileName;
  if (options.download !== false) downloadBlob(blob, fileName);
  const notes = notesHeader(response);
  return {
    fileName,
    blob,
    previewRows: await previewRowsOf(blob, options.preview),
    sourceRows: numericHeader(response, ROW_COUNT_HEADERS.sourceRows),
    productRows: numericHeader(response, ROW_COUNT_HEADERS.productRows),
    outputRows: numericHeader(response, ROW_COUNT_HEADERS.outputRows),
    skippedRows: numericHeader(response, ROW_COUNT_HEADERS.skippedRows),
    ...(notes ? { notes } : {}),
  };
}
