import { describe, expect, it } from 'vitest';
import { DETAIL_TEMPLATE_STYLES_ATTR } from '../../lib/template-html';
import {
  repairPackageImageFramesInDocument,
  sanitizePersistedHead,
} from './DetailPageEditor';

const CANONICAL_TEMPLATE_CSS = `/*! tailwindcss v4.2.2 */
.brightness-\\[0\\.7\\] { filter: brightness(0.7); }
.text-\\[80px\\] { font-size: 80px; }`;

const LEGACY_FALLBACK_CSS = `
.relative > img.h-\\[500px\\] + .absolute.inset-0.bg-gradient-to-t.from-white.via-transparent.to-transparent {
  display: none;
}
section[class*="from-[#1a1a1a]"] {
  background: linear-gradient(to bottom, #1a1a1a, #2d2d2d) !important;
}`;

describe('detail editor persisted HTML', () => {
  it('keeps and marks canonical compiled CSS while removing the legacy fallback block', () => {
    const output = sanitizePersistedHead(
      `<style>${CANONICAL_TEMPLATE_CSS}</style><style>${LEGACY_FALLBACK_CSS}</style>`,
      'width=860, initial-scale=1',
    );
    const doc = new DOMParser().parseFromString(`<head>${output}</head>`, 'text/html');
    const canonicalStyle = doc.head.querySelector<HTMLStyleElement>(
      `style[${DETAIL_TEMPLATE_STYLES_ATTR}]`,
    );

    expect(canonicalStyle?.textContent).toContain('tailwindcss v4.2.2');
    expect(canonicalStyle?.textContent).toContain('.brightness-\\[0\\.7\\]');
    expect(output).not.toContain('relative > img.h-\\[500px\\]');
  });

  it('persists package images in the canonical blue card frame', () => {
    const doc = new DOMParser().parseFromString(
      `<body>
        <div data-container="detailPackageImages">
          <div style="background:transparent;border:0;padding:0">
            <img src="/package.jpg" style="width:100%" />
          </div>
        </div>
      </body>`,
      'text/html',
    );

    repairPackageImageFramesInDocument(doc);

    const frame = doc.querySelector<HTMLElement>('[data-role="package-image-frame"]');
    const image = frame?.querySelector<HTMLImageElement>('img');
    expect(frame?.style.background).toBe('rgb(234, 246, 255)');
    expect(frame?.style.border).toBe('1px solid rgb(216, 235, 247)');
    expect(frame?.style.padding).toBe('40px');
    expect(image?.style.objectFit).toBe('contain');
    expect(image?.style.borderRadius).toBe('24px');
    expect(image?.style.mixBlendMode).toBe('multiply');
  });
});
