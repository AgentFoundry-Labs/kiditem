import { describe, expect, it } from 'vitest';
import {
  buildColorGuidePrompt,
  buildDetailCutPrompt,
  buildHeroBannerPrompt,
  buildHeroProductImagePrompt,
  buildPackageImagePositionsPrompt,
  buildSizeGuidePrompt,
  buildUsageGuidePrompt,
} from '../detail-page-media-prompts';

describe('detail-page media prompt builders', () => {
  it('prefers people-free generated hero banners and applies age rules', () => {
    const prompt = buildHeroBannerPrompt({
      organizationId: 'org',
      productName: '퐁퐁 슬라임',
      category: '완구',
      description: '말랑한 촉감놀이',
      options: '',
      templateId: 'bold-vertical',
      headline: '퐁퐁 슬라임',
      subhead: '쫀득하게 즐기는 슬라임',
      ageGroup: 'age-14-plus',
    });

    expect(prompt).toContain('prefer a product-only staged hero scene');
    expect(prompt).toContain('no visible people, no faces, no children');
    expect(prompt).toContain('at most ONE cropped hand/forearm');
    expect(prompt).toContain('For 14+ products');
    expect(prompt).toContain('AGE 14+ HARD RULE');
    expect(prompt).toContain('elementary-looking model');
    expect(prompt).toContain('TEXT-FREE HERO BANNER HARD RULE');
    expect(prompt).toContain('ZERO readable text');
    expect(prompt).toContain('DO NOT render as text');
    expect(prompt).toContain('headline/subhead above are only semantic mood references');
    expect(prompt).not.toContain('Headline mood: 퐁퐁 슬라임');
    expect(prompt).not.toContain('Subhead: 쫀득하게 즐기는 슬라임');
  });

  it('instructs Gemini to keep a wide size-guide product horizontal', () => {
    const prompt = buildSizeGuidePrompt({
      organizationId: 'org',
      productName: '고양이 꾹꾹 베개말랑이',
      category: '완구',
      description: '',
      options: '',
      imageUrls: ['https://example.com/product.jpg'],
      heightLabel: '60mm',
      widthLabel: '85mm',
    });

    expect(prompt).toContain('85mm is the horizontal width and 60mm is the vertical height');
    expect(prompt).toContain('visibly wider than tall');
    expect(prompt).toContain('Do not stand the product upright');
    expect(prompt).not.toContain('Template measurement labels');
    expect(prompt).toContain('SINGLE CUTOUT ONLY');
    expect(prompt).toContain('Absolutely do not add measurement lines, arrows, rulers, dimension text, or numbers');
    expect(prompt).toContain('Center the isolated product itself');
    expect(prompt).toContain('no partial package, display tray, backing card');
    expect(prompt).toContain('reconstruct the missing product bottom cleanly');
  });

  it('keeps generated usage images photo-only and leaves step text to the template', () => {
    const prompt = buildUsageGuidePrompt({
      organizationId: 'org',
      productName: '바삭바삭 수제왁스팝',
      category: '완구',
      description: '',
      options: '',
      imageUrls: ['https://example.com/product.jpg'],
      usageStep: '포장을 열고 왁스팝을 준비하세요.',
      variant: 1,
    });

    expect(prompt).toContain('IMAGE-ONLY OUTPUT');
    expect(prompt).toContain('Do not create an instruction card');
    expect(prompt).toContain('Do not render "사용법 안내"');
    expect(prompt).toContain('SINGLE PHOTO ONLY');
    expect(prompt).toContain('No split screen');
    expect(prompt).toContain('natural short nails, no manicure, no nail polish');
    expect(prompt).toContain('Use at most ONE visible hand');
    expect(prompt).toContain('Never show two hands');
    expect(prompt).toContain('clean white (#FFFFFF)');
    expect(prompt).toContain('Alignment must look deliberate');
    expect(prompt).toContain('PRODUCT-LOCKED STUDIO CLEANUP');
    expect(prompt).toContain('replace only the background with a clean neutral white');
    expect(prompt).toContain('Never warp, bend, liquify, stretch, compress, mirror, or perspective-distort');
    expect(prompt).toContain('SENSORY/SLIME CONTAINER HARD RULE');
    expect(prompt).toContain('The playable material and the hard container are different objects');
    expect(prompt).toContain('Slime is NOT a liquid');
    expect(prompt).toContain('Never depict it as water, juice, syrup, paint, soap solution, or a pourable liquid');
    expect(prompt).toContain('cohesive stretchy gel or soft semi-solid blob');
    expect(prompt).toContain('Never show a hand squeezing, kneading, stretching, folding, crushing, or deforming a plastic container');
  });

  it('forces color guide images into clean centered studio product lineups', () => {
    const prompt = buildColorGuidePrompt({
      organizationId: 'org',
      productName: '퐁퐁 젤리팝',
      category: '식품/간식/과자/젤리',
      description: '여러 색상의 젤리팝',
      options: '색상 구성: 여러 색상',
      imageUrls: ['https://example.com/color-row.jpg'],
    });

    expect(prompt).toContain('HARD BACKGROUND RULE');
    expect(prompt).toContain('image-generation/recomposition task, not image selection');
    expect(prompt).toContain('Reposition and recompose the product variants yourself');
    expect(prompt).toContain('clean white (#FFFFFF)');
    expect(prompt).toContain('Do not output the raw uploaded photo, a crop of the raw photo');
    expect(prompt).toContain('INVALID RESULT: if the final color guide keeps the same camera angle');
    expect(prompt).toContain('The variants must look intentionally re-positioned');
    expect(prompt).toContain('Alignment must look deliberate');
    expect(prompt).toContain('No hands, fingers, arms, people');
    expect(prompt).toContain('Avoid haze, blur, low contrast');
  });

  it('keeps the hero product image separate from the size guide image', () => {
    const prompt = buildHeroProductImagePrompt({
      organizationId: 'org',
      productName: '바삭바삭 수제왁스팝',
      category: '완구',
      description: '',
      options: '',
      imageUrls: ['https://example.com/product.jpg'],
    });

    expect(prompt).toContain('NOT the size-guide image');
    expect(prompt).toContain('image-generation/recomposition task, not image selection');
    expect(prompt).toContain('first standalone product image directly below the hero copy');
    expect(prompt).toContain('product-focused packshot');
    expect(prompt).toContain('clearly different from the top hero banner');
    expect(prompt).toContain('tighter product-only studio packshot');
    expect(prompt).toContain('Do NOT output an unchanged, cropped, scaled');
    expect(prompt).toContain('INVALID RESULT: if the final image has the same camera angle');
    expect(prompt).toContain('Rebuild the product arrangement as a fresh camera shot');
    expect(prompt).toContain('Change the composition from the references');
    expect(prompt).toContain('source photo that shows the clearest real product units');
    expect(prompt).toContain('fill the entire 4:3 frame edge-to-edge');
    expect(prompt).toContain('Do not leave white bands, letterboxing');
    expect(prompt).toContain('seamless studio surface');
    expect(prompt).toContain('template fills a tall full-width image slot with object-cover');
    expect(prompt).toContain('do NOT output one giant single unit');
    expect(prompt).toContain('Arrange several real units/variants together');
    expect(prompt).toContain('commercial catalog packshot');
    expect(prompt).toContain('Reposition and recompose the real product units yourself');
    expect(prompt).toContain('product group should occupy most of the frame');
    expect(prompt).toContain('STRICT NO-HAND RULE');
    expect(prompt).toContain('Convert all hand-held, squeezed, or "person holding product" references');
    expect(prompt).toContain('SINGLE PHOTO ONLY');
    expect(prompt).toContain('fresh clean studio background');
    expect(prompt).toContain('Make it visually different from a measurement/size guide');
    expect(prompt).toContain('Do not force the product into a perfect front-facing size-guide silhouette');
    expect(prompt).toContain('4:3 ecommerce product composition');
    expect(prompt).toContain('Do not use package boxes');
    expect(prompt).toContain('Do not redraw, redesign, recolor');
    expect(prompt).toContain('Straighten the horizon, center the product group');
  });

  it('uses teen/student audience rules for 14+ generated images', () => {
    const prompt = buildUsageGuidePrompt({
      organizationId: 'org',
      productName: '학생용 말랑이',
      category: '완구',
      description: '',
      options: '',
      imageUrls: ['https://example.com/product.jpg'],
      usageStep: '친구와 함께 촉감을 확인하세요.',
      variant: 1,
      ageGroup: 'age-14-plus',
    });

    expect(prompt).toContain('one cropped teen/adult-looking hand');
    expect(prompt).toContain('do not show a child face');
    expect(prompt).toContain('must read as 14+ teen/student or adult');
    expect(prompt).toContain('Do NOT use childish nursery/playroom cues');
    expect(prompt).toContain('Target age/audience: 14+ product');
  });

  it('prevents detail generated images from becoming callout cards', () => {
    const prompt = buildDetailCutPrompt({
      organizationId: 'org',
      productName: '바삭바삭 수제왁스팝',
      category: '완구',
      description: '',
      options: '',
      imageUrls: ['https://example.com/product.jpg'],
      variant: 1,
    });

    expect(prompt).toContain('not a callout card');
    expect(prompt).toContain('Do not create a "DETAIL FEATURE CALLOUT" design');
    expect(prompt).toContain('Do not render the product name inside this image');
    expect(prompt).toContain('No Korean text, English text, numbers');
    expect(prompt).toContain('Never use KC/safety labels, barcode labels');
    expect(prompt).toContain('Do not use package boxes, display boxes, outer boxes, or retail packaging as the subject');
    expect(prompt).toContain('Use at most ONE visible hand');
    expect(prompt).toContain('Never show two hands');
    expect(prompt).toContain('Do not output the raw uploaded photo');
    expect(prompt).toContain('Alignment must look deliberate');
    expect(prompt).toContain('No split screen');
    expect(prompt).toContain('Keep original visible color variants and set quantity exactly as provided');
    expect(prompt).toContain('SENSORY/SLIME CONTAINER HARD RULE');
    expect(prompt).toContain('a valid usage photo shows the container opened nearby and the exposed material being touched separately');
  });

  it('keeps package inference from treating color lineups as package boxes', () => {
    const prompt = buildPackageImagePositionsPrompt();

    expect(prompt).toContain('physical retail packaging as a container');
    expect(prompt).toContain('printed display tray');
    expect(prompt).toContain('backing header card');
    expect(prompt).toContain('Product-only color lineups are NOT package images');
    expect(prompt).toContain('even when they show many units');
    expect(prompt).toContain('choose only the display box/header/tray image');
  });
});
