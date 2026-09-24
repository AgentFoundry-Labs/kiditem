import { describe, expect, it } from 'vitest';
import {
  buildUploadedDetailPageHtml,
  UPLOADED_DETAIL_PAGE_MAX_IMAGES,
} from './uploaded-detail-page';

describe('올린 상세페이지', () => {
  it('올린 순서대로 세로로 쌓는다 — 몰 상세페이지는 잘라 올린 조각이 이어 붙어 한 장이다', () => {
    const html = buildUploadedDetailPageHtml({
      title: '슬라임 세트',
      imageUrls: ['https://cdn.example/1.jpg', 'https://cdn.example/2.jpg'],
    });

    expect(html.indexOf('1.jpg')).toBeLessThan(html.indexOf('2.jpg'));
    expect(html).toContain('<!doctype html>');
  });

  it('이미지가 없으면 만들지 않는다 — 빈 상세페이지는 등록은 되고 몰에서 빈 칸이 나간다', () => {
    expect(() => buildUploadedDetailPageHtml({ title: '슬라임', imageUrls: [] })).toThrow(/이미지가 필요/);
    expect(() => buildUploadedDetailPageHtml({ title: '슬라임', imageUrls: ['  '] })).toThrow(/이미지가 필요/);
  });

  it('상한을 넘기면 거절한다', () => {
    const many = Array.from({ length: UPLOADED_DETAIL_PAGE_MAX_IMAGES + 1 }, (_, i) => `https://cdn.example/${i}.jpg`);
    expect(() => buildUploadedDetailPageHtml({ title: '슬라임', imageUrls: many })).toThrow(/최대/);
  });

  it('상품명에 든 따옴표·꺾쇠가 HTML 을 깨지 않는다', () => {
    const html = buildUploadedDetailPageHtml({
      title: '<script>"세트"',
      imageUrls: ['https://cdn.example/1.jpg'],
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;&quot;세트&quot;');
  });

  it('제목이 비어도 만든다 — 상세페이지는 제목이 아니라 이미지가 본체다', () => {
    const html = buildUploadedDetailPageHtml({ title: '   ', imageUrls: ['https://cdn.example/1.jpg'] });

    expect(html).toContain('<title>상세페이지</title>');
  });
});
