import { BadRequestException, Injectable } from '@nestjs/common';
import { TextDecoder } from 'node:util';

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

@Injectable()
export class SellpiaInventoryFileValidator {
  validate(input: { buffer: Buffer; mimeType: string }): void {
    const mimeType = input.mimeType.toLowerCase().split(';', 1)[0]?.trim() ?? '';
    if (!ALLOWED_MIME_TYPES.has(mimeType)) throw invalidEnvelope();
    if (looksLikeHtmlOrLogin(input.buffer)) throw invalidEnvelope();
    if (
      input.buffer.subarray(0, OLE2_MAGIC.length).equals(OLE2_MAGIC)
      || ZIP_MAGICS.some((magic) => input.buffer.subarray(0, magic.length).equals(magic))
      || looksLikeSellpiaDelimitedText(input.buffer)
    ) return;
    throw invalidEnvelope();
  }
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
