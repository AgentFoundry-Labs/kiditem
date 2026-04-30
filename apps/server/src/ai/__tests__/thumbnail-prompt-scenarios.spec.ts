import { describe, it, expect } from 'vitest';
import {
  classifyCategory,
  inferEditCase,
  buildGenerateScenarioBlock,
  buildCreativeScenarioBlock,
} from '../domain/prompts/thumbnail-prompt-scenarios';

describe('classifyCategory', () => {
  it('toy — 완구/취미 대분류 경로', () => {
    expect(classifyCategory('완구/취미/악기/음향기기/교재용악기/리코더')).toBe('toy');
    expect(classifyCategory('완구')).toBe('toy');
  });

  it('stationery — 문구/오피스 대분류 경로', () => {
    expect(classifyCategory('문구/오피스/노트/연습장')).toBe('stationery');
    expect(classifyCategory('문구')).toBe('stationery');
  });

  it('living — 생활용품 또는 생활잡화', () => {
    expect(classifyCategory('생활용품/생활잡화/기타생활용품')).toBe('living');
    expect(classifyCategory('생활잡화')).toBe('living');
  });

  it('furniture — 가구/홈데코', () => {
    expect(classifyCategory('가구/홈데코/인테리어소품/장식소품')).toBe('furniture');
    expect(classifyCategory('가구')).toBe('furniture');
  });

  it('default — NULL / 빈 문자열 / 미매칭', () => {
    expect(classifyCategory(null)).toBe('default');
    expect(classifyCategory(undefined)).toBe('default');
    expect(classifyCategory('')).toBe('default');
    expect(classifyCategory('패션의류/여성의류')).toBe('default');
  });
});

describe('inferEditCase', () => {
  it('bundle — bundleImages 존재', () => {
    expect(inferEditCase({ bundleImages: ['a', 'b'] })).toBe('bundle');
  });

  it('color-variants — colorImages 존재 (bundle 없음)', () => {
    expect(inferEditCase({ colorImages: ['r', 'b'] })).toBe('color-variants');
  });

  it('compose — packagingImage 존재 (bundle/color 없음)', () => {
    expect(inferEditCase({ packagingImage: 'box.jpg' })).toBe('compose');
  });

  it('single — 기본', () => {
    expect(inferEditCase({})).toBe('single');
  });

  it('bundle 이 color / compose 보다 우선', () => {
    expect(
      inferEditCase({
        bundleImages: ['a', 'b'],
        colorImages: ['r', 'g'],
        packagingImage: 'box.jpg',
      }),
    ).toBe('bundle');
  });
});

describe('buildGenerateScenarioBlock', () => {
  it('toy + bundle → 완구 번들 시나리오 블록', () => {
    const block = buildGenerateScenarioBlock('toy', 'bundle');
    expect(block).toContain('Toy (bundle)');
    expect(block).toContain('recognizable at thumbnail size');
  });

  it('stationery + single → 문구 단품 블록', () => {
    const block = buildGenerateScenarioBlock('stationery', 'single');
    expect(block).toContain('Stationery (single piece)');
    expect(block).toContain('razor-sharp');
  });

  it('furniture + compose → 가구 compose 블록', () => {
    const block = buildGenerateScenarioBlock('furniture', 'compose');
    expect(block).toContain('Furniture / Home decor (product + packaging)');
  });

  it('default bucket → 전 editCase 모두 빈 문자열', () => {
    expect(buildGenerateScenarioBlock('default', 'single')).toBe('');
    expect(buildGenerateScenarioBlock('default', 'compose')).toBe('');
    expect(buildGenerateScenarioBlock('default', 'color-variants')).toBe('');
    expect(buildGenerateScenarioBlock('default', 'bundle')).toBe('');
  });
});

describe('buildCreativeScenarioBlock', () => {
  it('toy → 완구/취미 creative 블록', () => {
    const block = buildCreativeScenarioBlock('toy');
    expect(block).toContain('Toy / Hobby');
    expect(block).toContain('parents');
  });

  it('living → 생활잡화 creative 블록', () => {
    const block = buildCreativeScenarioBlock('living');
    expect(block).toContain('Living / Miscellaneous');
  });

  it('default → 빈 문자열', () => {
    expect(buildCreativeScenarioBlock('default')).toBe('');
  });
});
