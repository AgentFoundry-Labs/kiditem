import { BadRequestException, Injectable } from '@nestjs/common';
import { TextDecoder } from 'node:util';
import { inflateRawSync } from 'node:zlib';

const ALLOWED_MIME_TYPES = new Set([
  'application/octet-stream',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'text/tab-separated-values',
]);
const OLE2_MAGIC = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const ZIP_MAGICS = [
  Buffer.from('504b0304', 'hex'),
  Buffer.from('504b0506', 'hex'),
  Buffer.from('504b0708', 'hex'),
];
const INSPECTION_BYTE_LIMIT = 64 * 1024;
const MAX_COMPRESSED_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_ENTRY_COUNT = 256;
const MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const ZIP_END_MIN_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 0xffff;
const ZIP_DATA_DESCRIPTOR_FLAG = 0x0008;
const ZIP_DEFLATE_OPTION_FLAGS = 0x0006;
const ZIP_SUPPORTED_FLAGS = ZIP_DEFLATE_OPTION_FLAGS
  | ZIP_DATA_DESCRIPTOR_FLAG
  | 0x0800;

@Injectable()
export class SellpiaInventoryFileValidator {
  validate(input: { buffer: Buffer; mimeType: string }): void {
    const mimeType = input.mimeType.toLowerCase().split(';', 1)[0]?.trim() ?? '';
    if (!ALLOWED_MIME_TYPES.has(mimeType)) throw invalidEnvelope();
    if (input.buffer.length > MAX_COMPRESSED_BYTES) throw invalidEnvelope();
    if (looksLikeHtmlOrLogin(input.buffer)) throw invalidEnvelope();
    if (input.buffer.subarray(0, OLE2_MAGIC.length).equals(OLE2_MAGIC)) return;
    if (ZIP_MAGICS.some((magic) => input.buffer.subarray(0, magic.length).equals(magic))) {
      if (isBoundedXlsxPackage(input.buffer)) return;
      throw invalidEnvelope();
    }
    if (looksLikeSellpiaDelimitedText(input.buffer)) return;
    throw invalidEnvelope();
  }
}

function isBoundedXlsxPackage(buffer: Buffer): boolean {
  const endOffset = findZipEnd(buffer);
  if (endOffset === null) return false;
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(endOffset + 6);
  const diskEntryCount = buffer.readUInt16LE(endOffset + 8);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  const commentLength = buffer.readUInt16LE(endOffset + 20);
  if (
    diskNumber !== 0
    || centralDirectoryDisk !== 0
    || diskEntryCount !== entryCount
    || entryCount === 0
    || entryCount > MAX_ZIP_ENTRY_COUNT
    || centralDirectorySize === 0xffffffff
    || centralDirectoryOffset === 0xffffffff
    || endOffset + ZIP_END_MIN_BYTES + commentLength !== buffer.length
    || centralDirectoryOffset + centralDirectorySize !== endOffset
  ) return false;

  const names = new Set<string>();
  const compressedEntries: Array<{
    compressionMethod: number;
    compressedSize: number;
    dataOffset: number;
    uncompressedSize: number;
  }> = [];
  const localRanges: Array<{ start: number; end: number }> = [];
  let cursor = centralDirectoryOffset;
  let aggregateUncompressedSize = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > endOffset
      || buffer.readUInt32LE(cursor) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) return false;
    const flags = buffer.readUInt16LE(cursor + 8);
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const checksum = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const entryCommentLength = buffer.readUInt16LE(cursor + 32);
    const startingDisk = buffer.readUInt16LE(cursor + 34);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const recordEnd = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (
      (flags & ~ZIP_SUPPORTED_FLAGS) !== 0
      || (compressionMethod !== 0 && compressionMethod !== 8)
      || (
        compressionMethod === 0
        && (flags & ZIP_DEFLATE_OPTION_FLAGS) !== 0
      )
      || compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff
      || uncompressedSize > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES
      || startingDisk !== 0
      || recordEnd > endOffset
      || localHeaderOffset + 30 > centralDirectoryOffset
      || buffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_SIGNATURE
    ) return false;

    const name = normalizeZipEntryName(
      buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8'),
    );
    const localFlags = buffer.readUInt16LE(localHeaderOffset + 6);
    const localCompressionMethod = buffer.readUInt16LE(localHeaderOffset + 8);
    const localChecksum = buffer.readUInt32LE(localHeaderOffset + 14);
    const localCompressedSize = buffer.readUInt32LE(localHeaderOffset + 18);
    const localUncompressedSize = buffer.readUInt32LE(localHeaderOffset + 22);
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset > centralDirectoryOffset) return false;
    const localName = normalizeZipEntryName(
      buffer
        .subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLength)
        .toString('utf8'),
    );
    const usesDataDescriptor = (flags & ZIP_DATA_DESCRIPTOR_FLAG) !== 0;
    if (
      name === null
      || localName === null
      || localName !== name
      || localFlags !== flags
      || localCompressionMethod !== compressionMethod
      || (
        usesDataDescriptor
          ? localChecksum !== 0
            || localCompressedSize !== 0
            || localUncompressedSize !== 0
          : localChecksum !== checksum
            || localCompressedSize !== compressedSize
            || localUncompressedSize !== uncompressedSize
      )
      || names.has(name)
      || dataOffset + compressedSize > centralDirectoryOffset
    ) return false;
    const entryEnd = usesDataDescriptor
      ? dataDescriptorEnd(buffer, dataOffset + compressedSize, {
          checksum,
          compressedSize,
          uncompressedSize,
          centralDirectoryOffset,
        })
      : dataOffset + compressedSize;
    if (entryEnd === null) return false;
    aggregateUncompressedSize += uncompressedSize;
    if (aggregateUncompressedSize > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) return false;
    names.add(name);
    compressedEntries.push({
      compressionMethod,
      compressedSize,
      dataOffset,
      uncompressedSize,
    });
    localRanges.push({ start: localHeaderOffset, end: entryEnd });
    cursor = recordEnd;
  }
  if (cursor !== endOffset) return false;
  localRanges.sort((left, right) => left.start - right.start);
  if (localRanges.some((range, index) => (
    range.end > centralDirectoryOffset
    || (index > 0 && localRanges[index - 1]!.end > range.start)
  ))) return false;
  const hasRequiredPackageStructure = names.has('[Content_Types].xml')
    && names.has('_rels/.rels')
    && names.has('xl/workbook.xml')
    && names.has('xl/_rels/workbook.xml.rels')
    && [...names].some((name) => /^xl\/worksheets\/[^/]+\.xml$/i.test(name));
  return hasRequiredPackageStructure
    && compressedEntries.every((entry) => hasExactExpandedSize(buffer, entry));
}

function normalizeZipEntryName(name: string): string | null {
  const normalized = name.replace(/\\/g, '/');
  if (
    normalized.length === 0
    || normalized.includes('\0')
    || normalized.startsWith('/')
    || normalized.split('/').includes('..')
  ) return null;
  return normalized;
}

function dataDescriptorEnd(
  buffer: Buffer,
  offset: number,
  expected: {
    checksum: number;
    compressedSize: number;
    uncompressedSize: number;
    centralDirectoryOffset: number;
  },
): number | null {
  const hasSignature = offset + 4 <= expected.centralDirectoryOffset
    && buffer.readUInt32LE(offset) === ZIP_DATA_DESCRIPTOR_SIGNATURE;
  const payloadOffset = hasSignature ? offset + 4 : offset;
  const end = payloadOffset + 12;
  if (end > expected.centralDirectoryOffset) return null;
  if (
    buffer.readUInt32LE(payloadOffset) !== expected.checksum
    || buffer.readUInt32LE(payloadOffset + 4) !== expected.compressedSize
    || buffer.readUInt32LE(payloadOffset + 8) !== expected.uncompressedSize
  ) return null;
  return end;
}

function hasExactExpandedSize(
  buffer: Buffer,
  entry: {
    compressionMethod: number;
    compressedSize: number;
    dataOffset: number;
    uncompressedSize: number;
  },
): boolean {
  const compressed = buffer.subarray(
    entry.dataOffset,
    entry.dataOffset + entry.compressedSize,
  );
  if (entry.compressionMethod === 0) {
    return compressed.length === entry.uncompressedSize;
  }
  try {
    const expanded = inflateRawSync(compressed, {
      maxOutputLength: Math.min(
        entry.uncompressedSize + 1,
        MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES + 1,
      ),
    });
    return expanded.length === entry.uncompressedSize;
  } catch {
    return false;
  }
}

function findZipEnd(buffer: Buffer): number | null {
  if (buffer.length < ZIP_END_MIN_BYTES) return null;
  const lowerBound = Math.max(
    0,
    buffer.length - ZIP_END_MIN_BYTES - ZIP_MAX_COMMENT_BYTES,
  );
  for (let offset = buffer.length - ZIP_END_MIN_BYTES; offset >= lowerBound; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_END_SIGNATURE) return offset;
  }
  return null;
}

function looksLikeHtmlOrLogin(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, INSPECTION_BYTE_LIMIT).toString('utf8').toLowerCase();
  return /<!doctype\s+html|<html|<form[^>]+(?:login|signin)|sellpia[^\n]{0,100}(?:login|로그인)/i
    .test(sample);
}

function looksLikeSellpiaDelimitedText(buffer: Buffer): boolean {
  const sampleBuffer = buffer.subarray(0, INSPECTION_BYTE_LIMIT);
  if (sampleBuffer.includes(0)) return false;
  const candidates = [
    sampleBuffer.toString('utf8'),
    new TextDecoder('euc-kr').decode(sampleBuffer),
  ];
  return candidates.some((candidate) => candidate
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/, 20)
    .some((line) => /[,;\t]/.test(line) && /상품\s*코드/.test(line) && /재\s*고/.test(line)));
}

function invalidEnvelope(): BadRequestException {
  return new BadRequestException('Sellpia inventory file has an invalid workbook envelope');
}
