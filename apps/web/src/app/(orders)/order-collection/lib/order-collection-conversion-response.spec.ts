import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  conversionResultFrom,
  fileNameFromContentDisposition,
} from './order-collection-conversion-response';

const downloadBlob = vi.hoisted(() => vi.fn());
vi.mock('@/lib/browser-download', () => ({ downloadBlob }));

function csvResponse(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    headers: { 'content-type': 'text/csv', ...headers },
  });
}

beforeEach(() => {
  downloadBlob.mockClear();
});

/**
 * Five malls parsed `Content-Disposition` inline instead of using the version
 * the other seven shared, and each inline copy got the same three things wrong.
 * These are those three, stated as behaviour rather than as a diff.
 */
describe('fileNameFromContentDisposition', () => {
  it('reads the encoded name the server sent', () => {
    expect(fileNameFromContentDisposition(
      "attachment; filename*=UTF-8''%ED%95%B4%EB%B2%95%EB%AA%B0.xls",
    )).toBe('해법몰.xls');
  });

  it('does not care how the header is cased, which is not ours to dictate', () => {
    expect(fileNameFromContentDisposition(
      "attachment; FILENAME*=utf-8''%ED%95%B4%EB%B2%95%EB%AA%B0.xls",
    )).toBe('해법몰.xls');
  });

  it('falls back to the plain form rather than pretending there was no name', () => {
    expect(fileNameFromContentDisposition('attachment; filename="orders.xls"')).toBe('orders.xls');
  });

  it('survives an escape it cannot decode', () => {
    // `decodeURIComponent` throws URIError on a lone `%`. Naming a download is
    // not worth failing a conversion that already succeeded.
    expect(() => fileNameFromContentDisposition("attachment; filename*=UTF-8''bad%ZZ.xls"))
      .not.toThrow();
    expect(fileNameFromContentDisposition("attachment; filename*=UTF-8''bad%ZZ.xls"))
      .toBe('bad%ZZ.xls');
  });

  it('has no name to give when the header is absent or empty', () => {
    expect(fileNameFromContentDisposition(null)).toBeNull();
    expect(fileNameFromContentDisposition('attachment')).toBeNull();
  });
});

describe('conversionResultFrom', () => {
  it('reads the four row counts and the server filename, and downloads', async () => {
    const result = await conversionResultFrom(
      csvResponse('a,b\n1,2\n', {
        'Content-Disposition': "attachment; filename*=UTF-8''%EA%BC%AC%EB%A7%9D%EC%84%B8.csv",
        'X-Order-Collection-Source-Rows': '120',
        'X-Order-Collection-Product-Rows': '118',
        'X-Order-Collection-Output-Rows': '115',
        'X-Order-Collection-Skipped-Rows': '3',
      }),
      { defaultFileName: '꼬망세_셀피아변환.xls', preview: { csv: true } },
    );

    expect(result.fileName).toBe('꼬망세.csv');
    expect({
      sourceRows: result.sourceRows,
      productRows: result.productRows,
      outputRows: result.outputRows,
      skippedRows: result.skippedRows,
    }).toEqual({ sourceRows: 120, productRows: 118, outputRows: 115, skippedRows: 3 });
    expect(result.previewRows).toEqual([['a', 'b'], ['1', '2']]);
    expect(downloadBlob).toHaveBeenCalledOnce();
  });

  it('uses the mall default only when the server named nothing', async () => {
    const result = await conversionResultFrom(
      csvResponse('a\n'),
      { defaultFileName: '해법몰_셀피아변환.xls', preview: { csv: true } },
    );
    expect(result.fileName).toBe('해법몰_셀피아변환.xls');
  });

  it('treats an absent count as unknown, never as zero', async () => {
    const result = await conversionResultFrom(
      csvResponse('a\n', { 'X-Order-Collection-Source-Rows': 'not-a-number' }),
      { defaultFileName: 'x.xls', preview: { csv: true } },
    );
    expect(result.sourceRows).toBeNull();
    expect(result.skippedRows).toBeNull();
  });

  it('can be asked not to download, which is how the page previews first', async () => {
    await conversionResultFrom(
      csvResponse('a\n'),
      { defaultFileName: 'x.xls', preview: { csv: true }, download: false },
    );
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('keeps quoted commas and newlines inside one CSV field', async () => {
    const result = await conversionResultFrom(
      csvResponse('name,note\n"김, 철수","두 줄\n주소"\n'),
      { defaultFileName: 'x.csv', preview: { csv: true } },
    );
    expect(result.previewRows).toEqual([
      ['name', 'note'],
      ['김, 철수', '두 줄\n주소'],
    ]);
  });
});
