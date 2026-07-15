import { BadRequestException } from '@nestjs/common';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { SellpiaInventoryFileValidator } from './sellpia-inventory-file.validator';

describe('SellpiaInventoryFileValidator', () => {
  const validator = new SellpiaInventoryFileValidator();

  it.each([
    ['OLE2', ole2Buffer(), 'application/vnd.ms-excel'],
    ['raw BIFF worksheet', rawBiffWorksheetBuffer(), 'application/vnd.ms-excel'],
    ['XLSX', xlsxBuffer(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['CSV', Buffer.from('\uFEFF상품코드,상품명,재고\nSP-001,상품,3'), 'text/csv'],
    ['TSV', Buffer.from('상품 코드\t상품명\t재 고\nSP-001\t상품\t3'), 'text/tab-separated-values'],
    [
      'CP949 CSV',
      Buffer.concat([
        Buffer.from('bbf3c7b0c4dab5e52cc0e7b0ed0a', 'hex'),
        Buffer.from('SP-001,3'),
      ]),
      'text/csv',
    ],
  ])('accepts a supported %s envelope', (_label, buffer, mimeType) => {
    expect(() => validator.validate({ buffer, mimeType })).not.toThrow();
  });

  it.each([
    '<!doctype html><html><body>login</body></html>',
    '<html><form action="/login">Sellpia 로그인</form></html>',
  ])('rejects an HTML/login response without including its bytes', (content) => {
    let error: unknown;
    try {
      validator.validate({ buffer: Buffer.from(content), mimeType: 'text/html' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).not.toContain(content);
  });

  it('rejects a valid workbook magic under an unapproved MIME type', () => {
    expect(() => validator.validate({
      buffer: xlsxBuffer(),
      mimeType: 'application/pdf',
    })).toThrow(BadRequestException);
  });

  it('rejects an allowed MIME type when the bytes have no supported magic', () => {
    expect(() => validator.validate({
      buffer: Buffer.from('not a Sellpia workbook'),
      mimeType: 'application/vnd.ms-excel',
    })).toThrow(BadRequestException);
  });

  it.each([
    ['prefix-only BOF', rawBiffBof()],
    [
      'truncated record header',
      Buffer.concat([rawBiffBof(), Buffer.from([0x04, 0x02, 0x01])]),
    ],
    [
      'truncated record payload',
      Buffer.concat([rawBiffBof(), biffRecordHeader(0x0204, 8), Buffer.alloc(1)]),
    ],
    [
      'oversized record payload declaration',
      Buffer.concat([
        rawBiffBof(),
        biffRecordHeader(0x0204, 8_225),
        biffRecord(0x000a),
      ]),
    ],
    [
      'missing EOF',
      Buffer.concat([rawBiffBof(), rawBiffLabel()]),
    ],
    [
      'bytes after EOF',
      Buffer.concat([rawBiffWorksheetBuffer(), Buffer.from([0x00])]),
    ],
    [
      'wrong BOF record',
      Buffer.concat([rawBiffLabel(), biffRecord(0x000a)]),
    ],
    [
      'wrong BOF subtype',
      Buffer.concat([rawBiffBof(0x0005), rawBiffLabel(), biffRecord(0x000a)]),
    ],
    [
      'wrong BOF version',
      Buffer.concat([
        rawBiffBof(0x0010, 0x1234),
        rawBiffLabel(),
        biffRecord(0x000a),
      ]),
    ],
    [
      'nonempty EOF',
      Buffer.concat([
        rawBiffBof(),
        rawBiffLabel(),
        biffRecord(0x000a, Buffer.from([0x00])),
      ]),
    ],
    [
      'no data records',
      Buffer.concat([rawBiffBof(), biffRecord(0x000a)]),
    ],
  ])('rejects a raw BIFF worksheet with %s', (_label, buffer) => {
    expect(() => validator.validate({
      buffer,
      mimeType: 'application/vnd.ms-excel',
    })).toThrow(BadRequestException);
  });

  it('rejects an arbitrary ZIP that is not an XLSX package', () => {
    expect(() => validator.validate({
      buffer: zipBuffer([{ name: 'hello.txt' }]),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toThrow(BadRequestException);
  });

  it('rejects an XLSX ZIP entry whose declared expansion exceeds the per-entry limit', () => {
    expect(() => validator.validate({
      buffer: zipBuffer(xlsxPackageEntries({
        worksheetUncompressedSize: 32 * 1024 * 1024 + 1,
      })),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toThrow(BadRequestException);
  });

  it('rejects an XLSX ZIP whose aggregate declared expansion exceeds the total limit', () => {
    expect(() => validator.validate({
      buffer: zipBuffer(xlsxPackageEntries({
        worksheetUncompressedSize: 24 * 1024 * 1024,
        extraEntries: [
          { name: 'xl/sharedStrings.xml', uncompressedSize: 24 * 1024 * 1024 },
          { name: 'xl/styles.xml', uncompressedSize: 24 * 1024 * 1024 },
        ],
      })),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toThrow(BadRequestException);
  });

  it('rejects a deflate entry whose actual expansion exceeds its declared size', () => {
    expect(() => validator.validate({
      buffer: zipBuffer(xlsxPackageEntries({
        extraEntries: [{
          name: 'xl/sharedStrings.xml',
          content: Buffer.alloc(1024 * 1024),
          compressionMethod: 8,
          uncompressedSize: 1,
        }],
      })),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toThrow(BadRequestException);
  });

  it.each([
    ['flags', { localFlags: 0x0800 }],
    ['compression method', { localCompressionMethod: 8 as const }],
    ['normalized name', { localName: 'xl/sharedStringz.xml' }],
    ['compressed size', { localCompressedSize: 0 }],
    ['uncompressed size', { localUncompressedSize: 0 }],
  ])('rejects mismatched central/local %s metadata', (_label, mismatch) => {
    expect(() => validator.validate({
      buffer: zipBuffer(xlsxPackageEntries({
        extraEntries: [{
          name: 'xl/sharedStrings.xml',
          content: Buffer.from('tiny'),
          ...mismatch,
        }],
      })),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toThrow(BadRequestException);
  });

  it('accepts a bounded data-descriptor entry with deferred local sizes', () => {
    expect(() => validator.validate({
      buffer: zipBuffer(xlsxPackageEntries({
        extraEntries: [{
          name: 'xl/sharedStrings.xml',
          content: Buffer.from('tiny descriptor payload'),
          compressionMethod: 8,
          dataDescriptor: true,
        }],
      })),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).not.toThrow();
  });

  it.each([
    ['central', {
      centralExtra: zipExtraField(
        0x0001,
        zip64Sizes(32 * 1024 * 1024 + 1, 0),
      ),
    }],
    ['local', {
      localExtra: zipExtraField(
        0x0001,
        zip64Sizes(32 * 1024 * 1024 + 1, 0),
      ),
    }],
  ])('rejects a %s ZIP64 extra field that overrides bounded header sizes', (_label, extra) => {
    expect(() => validator.validate({
      buffer: zipBuffer(xlsxPackageEntries({
        extraEntries: [{
          name: 'xl/sharedStrings.xml',
          content: Buffer.from('tiny'),
          ...extra,
        }],
      })),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toThrow(BadRequestException);
  });

  it.each([
    ['central truncated header', { centralExtra: Buffer.from([0x55, 0x54, 0x01]) }],
    ['local truncated header', { localExtra: Buffer.from([0x55, 0x54, 0x01]) }],
    [
      'central truncated payload',
      { centralExtra: Buffer.from([0x55, 0x54, 0x04, 0x00, 0x01]) },
    ],
    [
      'local truncated payload',
      { localExtra: Buffer.from([0x55, 0x54, 0x04, 0x00, 0x01]) },
    ],
  ])('rejects a malformed %s extra-field region', (_label, extra) => {
    expect(() => validator.validate({
      buffer: zipBuffer(xlsxPackageEntries({
        extraEntries: [{
          name: 'xl/sharedStrings.xml',
          content: Buffer.from('tiny'),
          ...extra,
        }],
      })),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toThrow(BadRequestException);
  });

  it('accepts a structurally valid timestamp extra field in both ZIP headers', () => {
    const timestampExtra = zipExtraField(
      0x5455,
      Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00]),
    );
    expect(() => validator.validate({
      buffer: zipBuffer(xlsxPackageEntries({
        extraEntries: [{
          name: 'xl/sharedStrings.xml',
          content: Buffer.from('tiny'),
          centralExtra: timestampExtra,
          localExtra: timestampExtra,
        }],
      })),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).not.toThrow();
  });

  it.each([
    ['encrypted flag', { flags: 0x0001 }],
    ['unsupported flag', { flags: 0x0040 }],
    ['unsupported method', { compressionMethod: 12 as never }],
  ])('rejects an XLSX ZIP entry with an %s', (_label, metadata) => {
    expect(() => validator.validate({
      buffer: zipBuffer(xlsxPackageEntries({
        extraEntries: [{
          name: 'xl/sharedStrings.xml',
          content: Buffer.from('tiny'),
          ...metadata,
        }],
      })),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toThrow(BadRequestException);
  });

  it('rejects an XLSX ZIP with an excessive entry count', () => {
    expect(() => validator.validate({
      buffer: zipBuffer(xlsxPackageEntries({
        extraEntries: Array.from({ length: 252 }, (_, index) => ({
          name: `xl/media/empty-${index}.bin`,
        })),
      })),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })).toThrow(BadRequestException);
  });

  it('keeps the compressed upload envelope bounded at 10 MiB', () => {
    expect(() => validator.validate({
      buffer: Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(10 * 1024 * 1024)]),
      mimeType: 'application/vnd.ms-excel',
    })).toThrow(BadRequestException);
  });
});

type ZipEntry = {
  name: string;
  uncompressedSize?: number;
  content?: Buffer;
  compressionMethod?: 0 | 8;
  flags?: number;
  localFlags?: number;
  localCompressionMethod?: 0 | 8;
  localName?: string;
  localCompressedSize?: number;
  localUncompressedSize?: number;
  dataDescriptor?: boolean;
  centralExtra?: Buffer;
  localExtra?: Buffer;
};

function xlsxPackageEntries(input: {
  worksheetUncompressedSize?: number;
  extraEntries?: ZipEntry[];
} = {}): ZipEntry[] {
  return [
    { name: '[Content_Types].xml' },
    { name: '_rels/.rels' },
    { name: 'xl/workbook.xml' },
    { name: 'xl/_rels/workbook.xml.rels' },
    {
      name: 'xl/worksheets/sheet1.xml',
      uncompressedSize: input.worksheetUncompressedSize,
    },
    ...(input.extraEntries ?? []),
  ];
}

function zipBuffer(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const localName = Buffer.from(entry.localName ?? entry.name);
    const localExtra = entry.localExtra ?? Buffer.alloc(0);
    const centralExtra = entry.centralExtra ?? Buffer.alloc(0);
    const content = entry.content ?? Buffer.alloc(0);
    const compressionMethod = entry.compressionMethod ?? 0;
    const flags = entry.flags ?? (entry.dataDescriptor ? 0x0008 : 0);
    const localFlags = entry.localFlags ?? flags;
    const compressed = compressionMethod === 8 ? deflateRawSync(content) : content;
    const uncompressedSize = entry.uncompressedSize ?? content.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(localFlags, 6);
    local.writeUInt16LE(entry.localCompressionMethod ?? compressionMethod, 8);
    local.writeUInt32LE(
      entry.localCompressedSize ?? (entry.dataDescriptor ? 0 : compressed.length),
      18,
    );
    local.writeUInt32LE(
      entry.localUncompressedSize ?? (entry.dataDescriptor ? 0 : uncompressedSize),
      22,
    );
    local.writeUInt16LE(localName.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(compressionMethod, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(centralExtra.length, 30);
    central.writeUInt32LE(localOffset, 42);
    const descriptor = entry.dataDescriptor
      ? dataDescriptor(compressed.length, uncompressedSize)
      : Buffer.alloc(0);
    localParts.push(local, localName, localExtra, compressed, descriptor);
    centralParts.push(central, name, centralExtra);
    localOffset += local.length
      + localName.length
      + localExtra.length
      + compressed.length
      + descriptor.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function zipExtraField(id: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt16LE(id, 0);
  header.writeUInt16LE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

function zip64Sizes(uncompressedSize: number, compressedSize: number): Buffer {
  const sizes = Buffer.alloc(16);
  sizes.writeBigUInt64LE(BigInt(uncompressedSize), 0);
  sizes.writeBigUInt64LE(BigInt(compressedSize), 8);
  return sizes;
}

function dataDescriptor(compressedSize: number, uncompressedSize: number): Buffer {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(compressedSize, 8);
  descriptor.writeUInt32LE(uncompressedSize, 12);
  return descriptor;
}

function xlsxBuffer(): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['상품코드', '재고'], ['SP-001', 1]]),
    'Sheet1',
  );
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

function ole2Buffer(): Buffer {
  return Buffer.concat([
    Buffer.from('d0cf11e0a1b11ae1', 'hex'),
    Buffer.alloc(504),
  ]);
}

function rawBiffWorksheetBuffer(): Buffer {
  return Buffer.concat([
    rawBiffBof(),
    rawBiffLabel(),
    biffRecord(0x000a),
  ]);
}

function rawBiffBof(subtype = 0x0010, version = 0x0000): Buffer {
  const payload = Buffer.alloc(8);
  payload.writeUInt16LE(version, 0);
  payload.writeUInt16LE(subtype, 2);
  return biffRecord(0x0809, payload);
}

function rawBiffLabel(): Buffer {
  return biffRecord(0x0204, Buffer.alloc(8));
}

function biffRecord(type: number, payload = Buffer.alloc(0)): Buffer {
  return Buffer.concat([biffRecordHeader(type, payload.length), payload]);
}

function biffRecordHeader(type: number, payloadLength: number): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt16LE(type, 0);
  header.writeUInt16LE(payloadLength, 2);
  return header;
}
