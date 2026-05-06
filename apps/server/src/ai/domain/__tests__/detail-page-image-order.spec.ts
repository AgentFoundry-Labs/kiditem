import { describe, expect, it } from 'vitest';
import {
  looksLikeSafetyLabelImage,
  moveSafetyLabelImagesToEnd,
} from '../detail-page-image-order';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp') = require('sharp');

describe('detail-page-image-order', () => {
  it('moves marked safety label URLs to the end', () => {
    expect(
      moveSafetyLabelImagesToEnd([
        'https://cdn.example.com/product-a.jpg',
        'https://cdn.example.com/detail-page-inputs/org/safety-label-1.jpg',
        'https://cdn.example.com/product-b.jpg',
      ]),
    ).toEqual([
      'https://cdn.example.com/product-a.jpg',
      'https://cdn.example.com/product-b.jpg',
      'https://cdn.example.com/detail-page-inputs/org/safety-label-1.jpg',
    ]);
  });

  it('detects dense KC-style safety label images', async () => {
    const buffer = await sharp(Buffer.from(buildSafetyLabelSvg()))
      .png()
      .toBuffer();

    await expect(looksLikeSafetyLabelImage(buffer)).resolves.toBe(true);
  });

  it('does not classify a sparse product cut as a safety label', async () => {
    const buffer = await sharp(Buffer.from(buildProductCutSvg()))
      .png()
      .toBuffer();

    await expect(looksLikeSafetyLabelImage(buffer)).resolves.toBe(false);
  });
});

function buildSafetyLabelSvg(): string {
  const textRows = Array.from({ length: 14 }, (_, i) => {
    const y = 88 + i * 20;
    const width = i % 3 === 0 ? 320 : 460;
    return `<rect x="72" y="${y}" width="${width}" height="9" fill="#222"/>`;
  }).join('');
  const rightRows = Array.from({ length: 10 }, (_, i) => {
    const y = 92 + i * 22;
    const width = i % 2 === 0 ? 390 : 330;
    return `<rect x="500" y="${y}" width="${width}" height="8" fill="#222"/>`;
  }).join('');
  const barcode = Array.from({ length: 48 }, (_, i) => {
    const x = 440 + i * 6;
    const width = i % 5 === 0 ? 4 : i % 2 === 0 ? 2 : 1;
    return `<rect x="${x}" y="310" width="${width}" height="120" fill="#111"/>`;
  }).join('');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="520" viewBox="0 0 960 520">
      <rect width="960" height="520" fill="#8fa2cc"/>
      <rect x="24" y="20" width="912" height="480" rx="34" fill="#fff"/>
      <rect x="64" y="70" width="430" height="26" fill="#111"/>
      <rect x="520" y="70" width="170" height="28" rx="14" fill="#e22"/>
      ${textRows}
      ${rightRows}
      <circle cx="280" cy="310" r="44" fill="none" stroke="#111" stroke-width="16"/>
      <circle cx="370" cy="310" r="44" fill="none" stroke="#111" stroke-width="16"/>
      <rect x="430" y="260" width="300" height="54" fill="none" stroke="#111" stroke-width="8"/>
      ${barcode}
      <rect x="210" y="385" width="70" height="35" fill="#111"/>
      <rect x="310" y="385" width="70" height="35" fill="#111"/>
    </svg>
  `;
}

function buildProductCutSvg(): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
      <rect width="800" height="800" fill="#fff"/>
      <circle cx="400" cy="390" r="190" fill="#50a7f2"/>
      <rect x="270" y="520" width="260" height="80" rx="28" fill="#f7d34f"/>
    </svg>
  `;
}
