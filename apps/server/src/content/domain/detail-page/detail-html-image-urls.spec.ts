import { describe, expect, it } from 'vitest';
import { rewriteDetailHtmlImageUrls } from './detail-html-image-urls';

describe('rewriteDetailHtmlImageUrls', () => {
  const replacements = new Map([
    ['https://pic.sabangnet.co.kr/d/1.jpg', 'https://storage.example/1.jpg'],
    ['https://pic.sabangnet.co.kr/d/2.jpg', 'https://storage.example/2.jpg'],
  ]);

  it('rewrites img src and source srcset references, including protocol-relative ones, and leaves other text alone', () => {
    const html = [
      '<p>https://pic.sabangnet.co.kr/d/1.jpg 는 글자라 그대로</p>',
      '<img src="https://pic.sabangnet.co.kr/d/1.jpg">',
      "<img alt='x' src='//pic.sabangnet.co.kr/d/2.jpg'>",
      '<source srcset="https://pic.sabangnet.co.kr/d/1.jpg 1x, https://other.example/3.jpg 2x">',
    ].join('');

    expect(rewriteDetailHtmlImageUrls(html, replacements)).toEqual({
      html: [
        '<p>https://pic.sabangnet.co.kr/d/1.jpg 는 글자라 그대로</p>',
        '<img src="https://storage.example/1.jpg">',
        "<img alt='x' src='https://storage.example/2.jpg'>",
        '<source srcset="https://storage.example/1.jpg 1x, https://other.example/3.jpg 2x">',
      ].join(''),
      changed: true,
    });
  });

  it('reports no change when nothing matches', () => {
    expect(rewriteDetailHtmlImageUrls('<img src="https://other.example/a.jpg">', replacements))
      .toEqual({ html: '<img src="https://other.example/a.jpg">', changed: false });
  });
});
